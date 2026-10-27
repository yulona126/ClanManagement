"""创建本地开发用的测试账号（演示三种权限）。

三个账号覆盖权限矩阵的三档，便于验证「谁能发布、谁能进管理台」：

    demo     owner  + staff   能进 /manage、能改空间设置、能发布
    mom      editor           能发布/编辑/评论，无管理台
    grandma  viewer           只读 + 可评论，无发布、无设置

用法::

    docker compose exec api python manage.py seed_demo
    docker compose exec api python manage.py seed_demo --password 自定义口令
    docker compose exec api python manage.py seed_demo --workspace-id 2

**生产环境默认拒绝执行**（测试口令不能出现在线上）。确实需要时用 --force。

只创建/更新这几个固定账号与它们的 Membership，不动其它数据。
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.clan.models import Membership, Workspace

DEFAULT_PASSWORD = "claner123"

# username, is_staff, role, relation_label, display_name
ACCOUNTS = (
    ("demo", True, "owner", "爸爸", "演示爸爸"),
    ("mom", False, "editor", "妈妈", "演示妈妈"),
    ("grandma", False, "viewer", "外婆", "演示外婆"),
)


class Command(BaseCommand):
    help = "创建本地测试账号（owner+staff / editor / viewer 三档权限）。"

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=DEFAULT_PASSWORD,
            help=f"统一口令（默认 {DEFAULT_PASSWORD}，仅本地使用）",
        )
        parser.add_argument(
            "--workspace-id",
            type=int,
            help="挂到哪个 Workspace（默认取第一个；没有就建一个）",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="在 production 环境下强制执行（不建议）",
        )

    def handle(self, *args, **options):
        env = os.getenv("DJANGO_ENV", "local").strip().lower()
        if env == "production" and not options["force"]:
            raise CommandError(
                "当前是 production 环境，拒绝创建弱口令测试账号。"
                "确需执行请加 --force，并在之后立即改掉口令。"
            )

        password = options["password"]
        if env == "production" and password == DEFAULT_PASSWORD:
            raise CommandError(
                f"生产环境不能用默认口令 {DEFAULT_PASSWORD}，请用 --password 指定强口令。"
            )

        ws = self._workspace(options.get("workspace_id"))
        User = get_user_model()
        rows = []

        for username, is_staff, role, relation, display in ACCOUNTS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "is_staff": is_staff,
                    "is_superuser": False,
                    "email": f"{username}@example.com",
                },
            )
            # 已存在的也重置口令，保证文档里写的口令始终可用
            user.set_password(password)
            user.is_staff = is_staff
            user.is_superuser = False
            if not user.email:
                user.email = f"{username}@example.com"
            user.save()

            Membership.objects.update_or_create(
                user=user,
                workspace=ws,
                defaults={
                    "role": role,
                    "relation_label": relation,
                    "display_name": display,
                },
            )
            rows.append((username, "新建" if created else "更新", is_staff, role))

        self.stdout.write(f"Workspace: {ws.name}（id={ws.id}，宝宝 {ws.baby_name}）")
        for username, action, is_staff, role in rows:
            self.stdout.write(
                f"  {action} {username:8s} 角色={role:7s} staff={is_staff}"
            )
        self.stdout.write(self.style.SUCCESS(f"\n统一口令: {password}"))
        self.stdout.write(
            "登录后需先选空间；demo 可进 /manage，grandma 会被拦回 /spaces。"
        )

    def _workspace(self, workspace_id: int | None) -> Workspace:
        if workspace_id:
            try:
                return Workspace.objects.get(pk=workspace_id)
            except Workspace.DoesNotExist as exc:
                raise CommandError(f"Workspace {workspace_id} 不存在") from exc

        ws = Workspace.objects.order_by("id").first()
        if ws:
            return ws
        ws = Workspace.objects.create(name="夏夏的空间", baby_name="夏夏")
        self.stdout.write(self.style.WARNING("没有 Workspace，已创建「夏夏的空间」"))
        return ws
