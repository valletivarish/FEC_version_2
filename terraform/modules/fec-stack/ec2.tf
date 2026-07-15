data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_iam_instance_profile" "lab" {
  name = var.lab_instance_profile_name
}

resource "aws_security_group" "fog" {
  name        = "${var.prefix}-fog-sg"
  description = "fog node HTTP"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = var.ec2_port
    to_port     = var.ec2_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "fog" {
  ami                    = var.ec2_ami
  instance_type          = var.ec2_instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.fog.id]
  iam_instance_profile   = data.aws_iam_instance_profile.lab.name

  user_data = templatefile("${path.module}/templates/userdata.sh.tftpl", {
    deploy_bucket = aws_s3_bucket.deploy.bucket
    tarball_key   = "deploy-src.tar.gz"
    work_dir      = "/opt/${var.prefix}"
    compose_file  = var.ec2_compose_file
    region        = var.region
  })

  tags = {
    Name = "${var.prefix}-fog-host"
  }

  depends_on = [aws_s3_object.deploy_tarball]
}

resource "aws_eip" "fog" {
  domain   = "vpc"
  instance = aws_instance.fog.id
}
