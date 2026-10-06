from django.db import migrations, models


def mark_comment_audio(apps, schema_editor):
    Comment = apps.get_model("clan", "Comment")
    MediaAsset = apps.get_model("clan", "MediaAsset")
    audio_ids = (
        Comment.objects.filter(audio_id__isnull=False)
        .values_list("audio_id", flat=True)
        .distinct()
    )
    MediaAsset.objects.filter(id__in=audio_ids).update(for_comment=True)


def unmark_comment_audio(apps, schema_editor):
    MediaAsset = apps.get_model("clan", "MediaAsset")
    MediaAsset.objects.filter(for_comment=True).update(for_comment=False)


class Migration(migrations.Migration):

    dependencies = [
        ("clan", "0006_membership_profile_kinship"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediaasset",
            name="for_comment",
            field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name="mediaasset",
            index=models.Index(
                fields=["record", "for_comment"],
                name="clan_mediaa_record__7c0f0e_idx",
            ),
        ),
        migrations.RunPython(mark_comment_audio, unmark_comment_audio),
    ]
