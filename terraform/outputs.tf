output "ec2_public_ip" {
  description = "Public IP address of the EC2 Application Host"
  value       = aws_instance.app_host.public_ip
}

output "ec2_instance_id" {
  description = "EC2 Instance ID for AWS Instance Connect"
  value       = aws_instance.app_host.id
}

output "rds_endpoint" {
  description = "Private endpoint of Amazon RDS PostgreSQL 17"
  value       = aws_db_instance.postgres.endpoint
}

output "database_url_template" {
  description = "DATABASE_URL for your Next.js application"
  value       = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/inventory_db"
  sensitive   = true
}
output "cloudwatch_ec2_alarm" {
  description = "Name of the EC2 High CPU CloudWatch Alarm"
  value       = aws_cloudwatch_metric_alarm.ec2_cpu_high.alarm_name
}

output "cloudwatch_rds_alarm" {
  description = "Name of the RDS High CPU CloudWatch Alarm"
  value       = aws_cloudwatch_metric_alarm.rds_cpu_high.alarm_name
}
