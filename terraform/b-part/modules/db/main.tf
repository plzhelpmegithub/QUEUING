# waiting_queue: ordered list of people eligible for cancellation-ticket
# links, per event. PK=event_id groups all waiters for one show;
# SK=queue_index gives a natural sort order so "get the next N waiters"
# is a single cheap Query (begins/ends at a queue_index range).
resource "aws_dynamodb_table" "waiting_queue" {
  name         = "${var.project_name}-waiting-queue"
  billing_mode = "PAY_PER_REQUEST" # on-demand: traffic is spiky and bursty

  hash_key  = "event_id"
  range_key = "queue_index"

  attribute {
    name = "event_id"
    type = "S"
  }

  attribute {
    name = "queue_index"
    type = "N"
  }

  tags = {
    Name = "${var.project_name}-waiting-queue"
  }
}

# cancel_allocations: current seat -> user assignment when a cancellation
# link is issued. PK=event_id, SK=seat_id since a seat only has one
# active allocation at a time.
resource "aws_dynamodb_table" "cancel_allocations" {
  name         = "${var.project_name}-cancel-allocations"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "event_id"
  range_key = "seat_id"

  attribute {
    name = "event_id"
    type = "S"
  }

  attribute {
    name = "seat_id"
    type = "S"
  }

  # Best-effort cleanup of stale allocations. The exact 5-minute
  # enforcement still happens in Redis (ElastiCache) - this TTL is
  # just garbage collection, not the real-time timer.
  ttl {
    attribute_name = "expires_at_epoch"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-cancel-allocations"
  }
}

# cancellation_link: the single-use token a user actually clicks.
# PK=token because lookups happen by token only (user opens the link).
# A GSI on seat_id lets a worker find "the link for this seat" when it
# needs to expire/reissue one from the allocation side.
resource "aws_dynamodb_table" "cancellation_link" {
  name         = "${var.project_name}-cancellation-link"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "token"

  attribute {
    name = "token"
    type = "S"
  }

  attribute {
    name = "seat_id"
    type = "S"
  }

  global_secondary_index {
    name            = "seat_id-index"
    hash_key        = "seat_id"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at_epoch"
    enabled        = true
  }

  tags = {
    Name = "${var.project_name}-cancellation-link"
  }
}
