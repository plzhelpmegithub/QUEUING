variable "project_name" {
  type = string
}

variable "visibility_timeout_seconds" {
  description = "How long a message is hidden after a worker picks it up, before it becomes visible again if not deleted"
  type        = number
  default     = 30
}

variable "message_retention_seconds" {
  description = "How long an unprocessed message stays in the queue"
  type        = number
  default     = 345600 # 4 days
}

variable "max_receive_count" {
  description = "How many times a worker can fail to process a message before it moves to the DLQ"
  type        = number
  default     = 5
}
