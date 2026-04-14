import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.security import get_current_user_id

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "audio/mpeg", "audio/wav", "audio/ogg",
    "application/pdf",
    "application/zip",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a file (image, video, document) for BlockNote editor."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Тип файлу не підтримується: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл занадто великий (макс 50MB)")

    # Generate unique filename
    ext = Path(file.filename or "").suffix.lower() or ""
    file_id = f"{uuid.uuid4().hex}{ext}"

    # User folder
    user_dir = UPLOAD_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    file_path = user_dir / file_id
    file_path.write_bytes(content)

    # Return public URL
    url = f"/api/v1/uploads/{user_id}/{file_id}"
    return {"url": url, "name": file.filename, "size": len(content), "type": file.content_type}


@router.get("/{user_id}/{file_id}")
async def get_file(user_id: str, file_id: str):
    """Serve uploaded file (public, no auth — URLs are unguessable UUIDs)."""
    file_path = UPLOAD_DIR / user_id / file_id
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Prevent path traversal
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")

    # Detect proper content-type by extension
    media_type, _ = mimetypes.guess_type(str(file_path))
    if not media_type:
        media_type = "application/octet-stream"

    # Headers for media streaming — allow embedding and range requests
    headers = {
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
    }

    return FileResponse(file_path, media_type=media_type, headers=headers)
