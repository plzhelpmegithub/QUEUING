output "waiting_queue_table_name" {
  value = aws_dynamodb_table.waiting_queue.name
}

output "waiting_queue_table_arn" {
  value = aws_dynamodb_table.waiting_queue.arn
}

output "cancel_allocations_table_name" {
  value = aws_dynamodb_table.cancel_allocations.name
}

output "cancel_allocations_table_arn" {
  value = aws_dynamodb_table.cancel_allocations.arn
}

output "cancellation_link_table_name" {
  value = aws_dynamodb_table.cancellation_link.name
}

output "cancellation_link_table_arn" {
  value = aws_dynamodb_table.cancellation_link.arn
}
