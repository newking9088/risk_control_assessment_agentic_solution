from fastapi import Depends, Request
from typing import Annotated

from app.config.constants import ROLE_WEIGHTS
from app.errors import ForbiddenError
from app.middleware.auth import get_current_user


def require_minimum_role(minimum_role: str):
    async def dependency(
        request: Request,
        user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        user_role = user.get("role", "viewer")
        if ROLE_WEIGHTS.get(user_role, -1) < ROLE_WEIGHTS.get(minimum_role, 999):
            raise ForbiddenError()
        request.state.user = user
        return user

    return dependency
