"""Apply OSS bucket CORS for browser direct PUT (stage 4)."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


DEFAULT_ORIGINS = [
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "http://192.168.50.247:5180",
    "http://192.168.50.249:5180",
]


class Command(BaseCommand):
    help = "Configure Aliyun OSS bucket CORS for frontend direct upload."

    def add_arguments(self, parser):
        parser.add_argument(
            "--origin",
            action="append",
            dest="origins",
            help="Allowed Origin (repeatable). Defaults include localhost:5180.",
        )

    def handle(self, *args, **options):
        if settings.STORAGE_BACKEND != "oss":
            raise CommandError("STORAGE_BACKEND must be oss.")

        if not settings.OSS_ACCESS_KEY_ID or not settings.OSS_ACCESS_KEY_SECRET:
            raise CommandError("OSS credentials missing in .env.")

        origins = options["origins"] or DEFAULT_ORIGINS

        import boto3
        from botocore.client import Config

        client = boto3.client(
            "s3",
            aws_access_key_id=settings.OSS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.OSS_ACCESS_KEY_SECRET,
            endpoint_url=settings.OSS_ENDPOINT,
            region_name=settings.OSS_REGION,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
            ),
        )

        rules = [
            {
                "AllowedOrigins": origins,
                "AllowedMethods": ["GET", "PUT", "HEAD", "POST"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": ["ETag", "x-oss-request-id"],
                "MaxAgeSeconds": 3600,
            },
        ]

        client.put_bucket_cors(
            Bucket=settings.OSS_BUCKET_NAME,
            CORSConfiguration={"CORSRules": rules},
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"CORS updated on bucket {settings.OSS_BUCKET_NAME} for:\n"
                + "\n".join(f"  - {o}" for o in origins),
            ),
        )
