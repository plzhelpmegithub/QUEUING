# Dead Letter Queue - holds messages that failed processing
# after max_receive_count retries. Lets you inspect/replay bad events
# instead of losing them silently.
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-cancellation-events-dlq"
  message_retention_seconds = 1209600 # 14 days, the SQS max

  tags = {
    Name = "${var.project_name}-cancellation-events-dlq"
  }
}

# Main queue - buffers "ticket cancelled" events so a traffic spike
# (many cancellations at once) doesn't hit the backend/DB directly.
# Workers (EKS + KEDA) will poll this queue.
resource "aws_sqs_queue" "cancellation_events" {
  name                       = "${var.project_name}-cancellation-events"
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = 10 # long polling, cuts empty-receive cost

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = {
    Name = "${var.project_name}-cancellation-events"
  }
}

# Let the main queue's DLQ policy actually point at a queue this account
# owns and can redrive into - required by AWS for redrive_allow_policy.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.cancellation_events.arn]
  })
}
