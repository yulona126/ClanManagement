"""Settings package entrypoint.

Default: local (DEBUG on).
Production: set ``DJANGO_ENV=production`` (or
``DJANGO_SETTINGS_MODULE=config.settings.production``).
"""

import os

_env = os.getenv("DJANGO_ENV", "local").strip().lower()

if _env in {"prod", "production"}:
    from .production import *  # noqa: F401,F403
else:
    from .local import *  # noqa: F401,F403
