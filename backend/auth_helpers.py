import os
import re
import httpx
from fastapi import HTTPException

GUEST_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


async def get_user_id_from_token(authorization_header: str | None) -> str:
    """
    Resolve a user id from Authorization.

    Accepted schemes:
    - Bearer <jwt>: Supabase user id via /auth/v1/user
    - Guest <uuid>: anonymous browser identity (no sign-in)
    """
    if not authorization_header:
        raise HTTPException(status_code=401, detail="Missing auth token")

    scheme, _, credential = authorization_header.partition(" ")
    scheme = scheme.strip()
    credential = credential.strip()

    if scheme.lower() == "guest":
        if not GUEST_ID_RE.match(credential):
            raise HTTPException(status_code=401, detail="Invalid guest id")
        return credential

    if scheme.lower() != "bearer" or not credential:
        raise HTTPException(status_code=401, detail="Missing auth token")

    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not anon:
        raise HTTPException(status_code=500, detail="Supabase auth env vars not configured")

    endpoint = url.rstrip("/") + "/auth/v1/user"
    headers = {"Authorization": f"Bearer {credential}", "apikey": anon}
    async with httpx.AsyncClient() as client:
        resp = await client.get(endpoint, headers=headers, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid auth token")
        data = resp.json()
        return data["id"]
