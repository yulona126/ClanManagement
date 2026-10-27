"""灌入一批演示动态 + 图片 + 一个相册（仅本地开发）。

配合 `seed_demo`（建三档测试账号）使用：账号建好后 Feed / 相册 / 家族页
才有内容可看，不用手点「发第一条动态」。

设计要点：

- **不碰 OSS**：图片直接生成为本地 SVG 写到 `MEDIA_ROOT`，`file_url` 用
  相对路径 `/media/...`（`config/urls.py` 在 DEBUG 下会服务它）。
  开发机通常 `STORAGE_BACKEND=oss`，直接走上传会往真实桶里塞测试图。
- **不依赖 Pillow**：用内联 SVG 生成占位图，任何环境都能跑。
- 幂等：可重复执行；`--reset` 会先删掉这些测试账号在此空间发表的动态与相册。
- 日期会写回过去 60 天，而不是全挤在「今天」。

用法::

    docker compose exec api python manage.py seed_demo_content
    docker compose exec api python manage.py seed_demo_content --reset
    docker compose exec api python manage.py seed_demo_content --records 20
"""

from __future__ import annotations

import os
import random
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.clan.models import (
    Album,
    AlbumItem,
    GrowthRecord,
    MediaAsset,
    Membership,
    Workspace,
)

SEED_AUTHORS = ("demo", "mom", "grandma")

# 每张占位图的配色（柔和、互相区分）
PALETTES = (
    ("#f4f1ec", "#ded6cb", "#b9ada0"),
    ("#eef1f4", "#d6dde3", "#aeb9c2"),
    ("#f3eee9", "#e0d3c6", "#c0a894"),
    ("#eef2ee", "#d7e0d8", "#adbcb1"),
    ("#f5f2f6", "#ddd5e2", "#b6a9bb"),
    ("#f2f2f0", "#dcdcd8", "#b3b3ad"),
)

# (标题, 正文)：内容对齐「婴儿成长记录」语境
MOMENTS = (
    ("第一次自己扶着栏杆站起来", "站了大概七秒。第三秒的时候她回头看我，眼睛亮得像刚发现新大陆。"),
    ("楼下的樱花开了", "推车出去转了一圈，她在树下一直仰头，风一吹就咯咯笑。"),
    ("今天的辅食是南瓜泥", "第一口表情很复杂，第二口就张嘴等了。围兜上全是。"),
    ("半岁体检 · 一切正常", "身高 68cm，体重 8.4kg，都在中上。医生说可以试颗粒状食物了。"),
    ("会翻身了", "从仰卧翻到俯卧，翻过去自己吓了一跳，趴着大喊。"),
    ("第一次笑出声", "爸爸学小狗叫的时候她笑出了声，很短，但我们都听见了。"),
    ("奶奶寄来的小毛衣", "手工织的，领口绣了一个歪扭的「夏」字。有点大，明年刚好。"),
    ("对着镜子里的自己笑", "今天发现镜子里有个小孩，兴奋地拍镜子，拍到手红。"),
    ("凌晨三点的小夜灯", "又是一个哄睡的夜晚。她在肩膀上打了个小嗝，呼吸就慢下来了。"),
    ("第一次出门晒太阳", "裹得像个小粽子，全程睡着，回来才醒。"),
    ("家里第一张全家福", "三脚架自拍，她那时候还不会看镜头。爷爷把这张洗出来挂客厅了。"),
    ("三个月的睡姿图鉴", "整理手机发现同一个角度拍了三十多张，删不掉，全留。"),
)


def svg_placeholder(index: int, w: int, h: int) -> str:
    """生成一张渐变 + 编号的占位 SVG（不依赖 Pillow）。"""
    bg, mid, ink = PALETTES[index % len(PALETTES)]
    cx = (index * 37) % 100
    cy = (index * 23) % 100
    label = f"{index + 1:02d}"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg}"/>
      <stop offset="55%" stop-color="{mid}"/>
      <stop offset="100%" stop-color="{ink}"/>
    </linearGradient>
    <radialGradient id="r" cx="{cx}%" cy="{cy}%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#g)"/>
  <rect width="{w}" height="{h}" fill="url(#r)"/>
  <g fill="none" stroke="{ink}" stroke-opacity=".28" stroke-width="1.2">
    <circle cx="{w / 2}" cy="{h / 2}" r="{min(w, h) * 0.22:.0f}"/>
    <circle cx="{w / 2}" cy="{h / 2}" r="{min(w, h) * 0.34:.0f}"/>
  </g>
  <text x="{w / 2}" y="{h / 2 + 8}" text-anchor="middle"
        font-family="Manrope, Helvetica, Arial, sans-serif" font-size="{min(w, h) * 0.09:.0f}"
        font-weight="700" fill="#ffffff" fill-opacity=".92" letter-spacing="1">{label}</text>
</svg>
"""


class Command(BaseCommand):
    help = "灌入演示动态 + 图片 + 相册（仅本地；不写 OSS，不依赖 Pillow）。"

    def add_arguments(self, parser):
        parser.add_argument("--records", type=int, default=len(MOMENTS), help="生成多少条动态")
        parser.add_argument(
            "--workspace-id", type=int, help="目标 Workspace（默认第一个）"
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="先删掉测试账号在本空间发表的动态与相册（不碰真实数据）",
        )
        parser.add_argument(
            "--seed", type=int, default=7, help="随机种子，保证可复现（默认 7）"
        )

    def handle(self, *args, **options):
        env = os.getenv("DJANGO_ENV", "local").strip().lower()
        if env == "production":
            raise CommandError(
                "production 环境拒绝灌入演示数据（会污染线上）。"
                "线上演示请在本地体验或单独准备数据集。"
            )

        ws = self._workspace(options.get("workspace_id"))
        authors = self._authors(ws)
        if not authors:
            raise CommandError(
                "这个空间里没有测试账号的 Membership。先跑：python manage.py seed_demo"
            )

        User = get_user_model()
        rng = random.Random(options["seed"])

        if options["reset"]:
            self._reset(ws)

        album = self._ensure_album(ws, authors[0][0])
        now = timezone.now()
        created_records = 0
        created_assets = 0

        for i in range(options["records"]):
            title, content = MOMENTS[i % len(MOMENTS)]
            author, _ = authors[i % len(authors)]
            rec = GrowthRecord.objects.create(
                workspace=ws,
                author=author,
                title=title,
                content=content,
            )
            # created_at 是 auto_now_add，只能在写入后回填
            days_ago = (options["records"] - i) * 5 + rng.randint(0, 2)
            created_at = now - timedelta(days=days_ago, hours=rng.randint(0, 12))
            GrowthRecord.objects.filter(pk=rec.pk).update(
                created_at=created_at, updated_at=created_at
            )

            # 每 5 条留一条纯文字，其余 1–3 张图
            shot_count = 0 if i % 5 == 4 else rng.choice((1, 2, 3))
            for j in range(shot_count):
                asset = self._make_asset(ws, rec, title, index=i * 3 + j)
                created_assets += 1
                if album is not None and j == 0:
                    AlbumItem.objects.get_or_create(
                        album=album,
                        media=asset,
                        defaults={
                            "added_by": author,
                            "sort_order": album.items.count() + 1,
                        },
                    )
            created_records += 1

        if album is not None and album.cover_id is None:
            first_item = album.items.order_by("sort_order", "id").first()
            if first_item:
                album.cover = first_item.media
                album.save(update_fields=["cover", "updated_at"])

        total_records = GrowthRecord.objects.filter(workspace=ws).count()
        total_media = MediaAsset.objects.filter(workspace=ws).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"已生成 {created_records} 条动态、{created_assets} 张图片"
                f"（相册：{album.title if album else '无'}）"
            )
        )
        self.stdout.write(
            f"空间「{ws.name}」现有 {total_records} 条动态 / {total_media} 个媒体"
        )
        self.stdout.write(f"图片目录：{Path(settings.MEDIA_ROOT) / 'workspaces' / str(ws.id)}")
        self.stdout.write(
            self.style.WARNING(
                "只在本地 DEBUG 下可通过 /media/ 访问；若 STORAGE_BACKEND=oss，"
                "这些图仍走本地相对路径，不会上传到 OSS。"
            )
        )
        self.stdout.write("\n打开 http://localhost:5180/ 用 demo / claner123 登录查看。")

    # ---------------------------------------------------------------- 辅助

    def _workspace(self, workspace_id: int | None) -> Workspace:
        if workspace_id:
            try:
                return Workspace.objects.get(pk=workspace_id)
            except Workspace.DoesNotExist as exc:
                raise CommandError(f"Workspace {workspace_id} 不存在") from exc
        ws = Workspace.objects.order_by("id").first()
        if not ws:
            raise CommandError("没有 Workspace，先跑：python manage.py seed_demo")
        return ws

    def _authors(self, ws: Workspace):
        User = get_user_model()
        rows = []
        for username in SEED_AUTHORS:
            user = User.objects.filter(username=username).first()
            m = (
                Membership.objects.filter(user=user, workspace=ws).first()
                if user
                else None
            )
            if user and m:
                rows.append((user, m))
        return rows

    def _reset(self, ws: Workspace) -> None:
        """只删测试账号发表的动态 / 创建的相册，不碰真实数据。"""
        User = get_user_model()
        users = User.objects.filter(username__in=SEED_AUTHORS)
        recs = GrowthRecord.objects.filter(workspace=ws, author__in=users)
        media_qs = MediaAsset.objects.filter(workspace=ws, record__in=recs)
        files = [m.object_key for m in media_qs]
        n_rec, n_media = recs.count(), media_qs.count()
        Album.objects.filter(workspace=ws, created_by__in=users).delete()
        media_qs.delete()
        recs.delete()
        # 删掉磁盘上的占位文件
        root = Path(settings.MEDIA_ROOT)
        for key in files:
            try:
                (root / key).unlink(missing_ok=True)
            except OSError:
                pass
        self.stdout.write(f"已清理：{n_rec} 条动态、{n_media} 个媒体文件")

    def _ensure_album(self, ws: Workspace, author) -> Album | None:
        album, _ = Album.objects.get_or_create(
            workspace=ws,
            title="夏夏的相册",
            defaults={
                "description": "演示用相册：动态里的首图会自动收进来。",
                "created_by": author,
            },
        )
        return album

    def _make_asset(
        self, ws: Workspace, rec: GrowthRecord, title: str, index: int
    ) -> MediaAsset:
        """在 MEDIA_ROOT 写一张 SVG，并登记 MediaAsset（file_url 用相对路径）。"""
        width, height = (1200, 900) if index % 2 == 0 else (900, 1200)
        key = f"workspaces/{ws.id}/records/{rec.id}/seed-{index:03d}.svg"
        path = Path(settings.MEDIA_ROOT) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(svg_placeholder(index, width, height), encoding="utf-8")

        return MediaAsset.objects.create(
            record=rec,
            workspace=ws,
            object_key=key,
            # 相对路径：resolveMediaUrl 原样返回，经 Vite/nginx 代理取本地文件
            file_url=f"{settings.MEDIA_URL}{key}",
            media_type=MediaAsset.MediaType.IMAGE,
            thumbnail_url=f"{settings.MEDIA_URL}{key}",
            width=width,
            height=height,
        )
