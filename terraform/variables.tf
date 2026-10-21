variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name prefix"
  type        = string
  default     = "b2b-ops"
}

variable "instance_type" {
  description = "EC2 instance size (2 vCPU, 2GB RAM)"
  type        = string
  default     = "t3.small"
}

variable "db_username" {
  description = "PostgreSQL Master Username"
  type        = string
  default     = "postgres_admin"
}

variable "db_password" {
  description = "PostgreSQL master password; supply it through a local tfvars file or the command line"
  type        = string
  sensitive   = true
}
