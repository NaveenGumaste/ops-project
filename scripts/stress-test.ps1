#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1",
    [ValidateRange(1, 50)]
    [int]$Concurrency = 10,
    [string]$ProductId = "prod-h100",
    [switch]$ConfirmReset
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmReset) {
    throw "This script deletes existing orders and resets inventory before running. Re-run with -ConfirmReset only against an isolated local database."
}

$uri = [Uri]::new($BaseUrl, [UriKind]::Absolute)
if (
    $uri.Scheme -notin @("http", "https") -or
    $uri.DnsSafeHost -notin @("localhost", "127.0.0.1", "::1") -or
    $uri.AbsolutePath -ne "/"
) {
    throw "BaseUrl must be a local origin such as http://127.0.0.1 or http://localhost:8080."
}
$BaseUrl = $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")

Write-Host "Checking that the API is using PostgreSQL..." -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -TimeoutSec 30
if (-not $health.database.connected -or $health.database.mode -ne "postgres") {
    throw "PostgreSQL is not connected. The script will not test the in-memory fallback."
}

Write-Warning "Resetting inventory deletes existing orders and restores seed stock in the local database."
Invoke-RestMethod -Uri "$BaseUrl/api/inventory" -Method Post -ContentType "application/json" -Body '{"action":"reset"}' -TimeoutSec 30 | Out-Null

$inventory = Invoke-RestMethod -Uri "$BaseUrl/api/inventory" -Method Get -TimeoutSec 30
$product = $inventory.products | Where-Object { $_.id -eq $ProductId } | Select-Object -First 1
if (-not $product) {
    throw "Product '$ProductId' was not found after the inventory reset."
}
$initialStock = [int]$product.stock

Write-Host "Sending $Concurrency parallel orders for $ProductId with $initialStock units available..." -ForegroundColor Cyan
$results = @(
    1..$Concurrency | ForEach-Object -Parallel {
        $ErrorActionPreference = "Stop"
        $buyerNumber = $_
        $payload = @{
            productId = $using:ProductId
            quantity = 1
            customerName = "Parallel Buyer $buyerNumber"
        } | ConvertTo-Json -Compress

        try {
            $request = @{
                Uri = "$($using:BaseUrl)/api/orders"
                Method = "Post"
                ContentType = "application/json"
                Body = $payload
                TimeoutSec = 30
                ErrorAction = "Stop"
            }
            $response = Invoke-RestMethod @request

            if (-not $response.success) {
                throw "The API returned a non-success response without an HTTP error."
            }

            [PSCustomObject]@{
                Buyer = "Buyer $buyerNumber"
                Outcome = "SUCCESS"
                RemainingStock = [int]$response.remainingStock
                LatencyMs = $response.executionTimeMs
            }
        } catch {
            $statusCode = 0
            if ($null -ne $_.Exception.Response) {
                try {
                    $statusCode = [int]$_.Exception.Response.StatusCode
                } catch {
                    $statusCode = 0
                }
            }
            if ($statusCode -ne 409) {
                throw "Buyer $buyerNumber received an unexpected HTTP or transport error: $($_.Exception.Message)"
            }

            $responseBody = $_.ErrorDetails.Message
            if (-not $responseBody -and $null -ne $_.Exception.Response.Content) {
                $responseBody = $_.Exception.Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            }
            if (-not $responseBody) {
                throw "Buyer $buyerNumber received HTTP 409 without a readable response body."
            }

            $details = $responseBody | ConvertFrom-Json -ErrorAction Stop
            if ($details.error -notlike "Insufficient stock:*") {
                throw "Buyer $buyerNumber received HTTP 409 for an unexpected reason."
            }

            [PSCustomObject]@{
                Buyer = "Buyer $buyerNumber"
                Outcome = "REJECTED"
                RemainingStock = [int]$details.remainingStock
                LatencyMs = $details.executionTimeMs
            }
        }
    } -ThrottleLimit $Concurrency
)

$successCount = @($results | Where-Object { $_.Outcome -eq "SUCCESS" }).Count
$rejectedCount = @($results | Where-Object { $_.Outcome -eq "REJECTED" }).Count
$expectedSuccess = [Math]::Min($initialStock, $Concurrency)
$expectedRejected = $Concurrency - $expectedSuccess

$finalInventory = Invoke-RestMethod -Uri "$BaseUrl/api/inventory" -Method Get -TimeoutSec 30
$finalProduct = $finalInventory.products | Where-Object { $_.id -eq $ProductId } | Select-Object -First 1
if (-not $finalProduct) {
    throw "Product '$ProductId' was missing from the final inventory response."
}
$finalStock = [int]$finalProduct.stock

$results | Sort-Object Buyer | Format-Table Buyer, Outcome, RemainingStock, LatencyMs -AutoSize

if (
    $results.Count -ne $Concurrency -or
    $successCount -ne $expectedSuccess -or
    $rejectedCount -ne $expectedRejected -or
    $finalStock -ne ($initialStock - $successCount)
) {
    throw "Concurrency check failed: got $successCount successes, $rejectedCount rejections, and $finalStock stock; expected $expectedSuccess successes and $expectedRejected rejections."
}

Write-Host "[PASS] $successCount orders succeeded, $rejectedCount were rejected, and stock ended at $finalStock." -ForegroundColor Green
