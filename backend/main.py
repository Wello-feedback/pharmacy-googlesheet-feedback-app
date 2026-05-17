"""
Pharmacy Customer Feedback System - Backend
FastAPI + SQLite + QR Code Generation
"""

import os
import io
import json
import base64
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response, FileResponse
from pydantic import BaseModel, Field
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import RadialGradiantColorMask
import barcode
from barcode.writer import ImageWriter

# ─── App Setup ─────────────────────────────────────────────
app = FastAPI(title="Pharmacy Feedback System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Configuration ─────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "feedback.db")
QR_DIR = os.path.join(os.path.dirname(__file__), "qr_codes")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

# Base URL - auto-detects Render URL, fallback to localhost
BASE_URL = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8585")

# ─── Branch Data ───────────────────────────────────────────
BRANCHES = [
    ("009", "AAPKA DAWA BAZAR-AGRASEN"),
    ("019", "AAPKA DAWA BAZAR-BURARI"),
    ("017", "AAPKA DAWA BAZAR-NANGLOI"),
    ("022", "AAPKA DAWA BAZAR-RANIBAGH"),
    ("020", "AAPKA DAWA BAZAR-VAISHALI"),
    ("012", "AAPKA DAWA BAZAR-YAMUNA VIHAR"),
    ("002", "CIVIL LINES PHARMACY"),
    ("004", "IRENE PHARMACY"),
    ("016", "KALYAN CHEMIST-KAROL BAGH"),
    ("003", "TRITON PHARMACY"),
    ("027", "WELLO PHARMACY (MORADABAD)"),
    ("010", "WELLO PHARMACY-LRS"),
    ("500", "WELLO RETAIL PVT LTD"),
]

# ─── Database ──────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS branches (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_code TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_mobile TEXT DEFAULT '',
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            improvement_tags TEXT DEFAULT '[]',
            comments TEXT DEFAULT '',
            latitude REAL,
            longitude REAL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (branch_code) REFERENCES branches(code)
        );

        CREATE INDEX IF NOT EXISTS idx_feedback_branch ON feedback(branch_code);
        CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
        CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);
    """)

    for code, name in BRANCHES:
        conn.execute(
            "INSERT OR REPLACE INTO branches (code, name) VALUES (?, ?)",
            (code, name),
        )
    conn.commit()
    conn.close()


# ─── Pydantic Models ──────────────────────────────────────
class BranchCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=10)
    name: str = Field(..., min_length=2, max_length=200)


class FeedbackCreate(BaseModel):
    branch_code: str
    customer_name: str = Field(..., min_length=2, max_length=100)
    customer_mobile: Optional[str] = ""
    rating: int = Field(..., ge=1, le=5)
    improvement_tags: List[str] = []
    comments: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class FeedbackResponse(BaseModel):
    id: int
    branch_code: str
    branch_name: str
    customer_name: str
    customer_mobile: str
    rating: int
    improvement_tags: List[str]
    comments: str
    latitude: Optional[float]
    longitude: Optional[float]
    created_at: str


# ─── API Endpoints ─────────────────────────────────────────

@app.on_event("startup")
async def startup():
    init_db()
    os.makedirs(QR_DIR, exist_ok=True)


@app.get("/api/branches")
async def get_branches():
    """Get list of all pharmacy branches."""
    conn = get_db()
    rows = conn.execute("SELECT code, name FROM branches ORDER BY code").fetchall()
    conn.close()
    return [{"code": r["code"], "name": r["name"]} for r in rows]


@app.post("/api/branches")
async def add_branch(branch: BranchCreate):
    """Add a new pharmacy branch."""
    conn = get_db()
    existing = conn.execute("SELECT code FROM branches WHERE code = ?", (branch.code,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Branch code '{branch.code}' already exists")
    conn.execute("INSERT INTO branches (code, name) VALUES (?, ?)", (branch.code, branch.name.strip()))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Branch '{branch.name}' added successfully"}


@app.put("/api/branches/{branch_code}")
async def update_branch(branch_code: str, branch: BranchCreate):
    """Update an existing pharmacy branch."""
    conn = get_db()
    existing = conn.execute("SELECT code FROM branches WHERE code = ?", (branch_code,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Branch not found")
    # If code is changing, update feedback references too
    if branch.code != branch_code:
        dup = conn.execute("SELECT code FROM branches WHERE code = ?", (branch.code,)).fetchone()
        if dup:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Branch code '{branch.code}' already exists")
        conn.execute("UPDATE feedback SET branch_code = ? WHERE branch_code = ?", (branch.code, branch_code))
        conn.execute("DELETE FROM branches WHERE code = ?", (branch_code,))
    conn.execute("INSERT OR REPLACE INTO branches (code, name) VALUES (?, ?)", (branch.code, branch.name.strip()))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Branch updated successfully"}


@app.delete("/api/branches/{branch_code}")
async def delete_branch(branch_code: str):
    """Delete a pharmacy branch."""
    conn = get_db()
    existing = conn.execute("SELECT code FROM branches WHERE code = ?", (branch_code,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Branch not found")
    # Check if branch has feedback
    fb_count = conn.execute("SELECT COUNT(*) as c FROM feedback WHERE branch_code = ?", (branch_code,)).fetchone()
    if fb_count["c"] > 0:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Cannot delete: branch has {fb_count['c']} feedback entries. Remove feedback first.")
    conn.execute("DELETE FROM branches WHERE code = ?", (branch_code,))
    # Remove QR code file if exists
    qr_file = os.path.join(QR_DIR, f"qr_{branch_code}.png")
    if os.path.exists(qr_file):
        os.remove(qr_file)
    conn.commit()
    conn.close()
    return {"success": True, "message": "Branch deleted successfully"}


@app.post("/api/feedback/submit")
async def submit_feedback(feedback: FeedbackCreate):
    """Submit customer feedback."""
    conn = get_db()

    # Verify branch exists
    branch = conn.execute(
        "SELECT name FROM branches WHERE code = ?", (feedback.branch_code,)
    ).fetchone()
    if not branch:
        conn.close()
        raise HTTPException(status_code=404, detail="Branch not found")

    conn.execute(
        """INSERT INTO feedback 
           (branch_code, customer_name, customer_mobile, rating, improvement_tags, comments, latitude, longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            feedback.branch_code,
            feedback.customer_name.strip(),
            feedback.customer_mobile or "",
            feedback.rating,
            json.dumps(feedback.improvement_tags),
            feedback.comments or "",
            feedback.latitude,
            feedback.longitude,
        ),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Feedback submitted successfully!"}


@app.get("/api/feedback/list")
async def get_feedback_list(
    branch_code: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    rating: Optional[int] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Get paginated list of feedback with filters."""
    conn = get_db()
    offset = (page - 1) * limit

    where_clauses = []
    params = []

    if branch_code:
        where_clauses.append("f.branch_code = ?")
        params.append(branch_code)
    if rating:
        where_clauses.append("f.rating = ?")
        params.append(rating)
    if search:
        where_clauses.append("(f.customer_name LIKE ? OR f.comments LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if date_from:
        where_clauses.append("f.created_at >= ?")
        params.append(date_from)
    if date_to:
        where_clauses.append("f.created_at <= ?")
        params.append(date_to + " 23:59:59")

    where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    # Get total count
    count_row = conn.execute(
        f"SELECT COUNT(*) as total FROM feedback f{where_sql}", params
    ).fetchone()
    total = count_row["total"]

    # Get feedback data
    rows = conn.execute(
        f"""SELECT f.*, b.name as branch_name 
            FROM feedback f 
            JOIN branches b ON f.branch_code = b.code
            {where_sql}
            ORDER BY f.created_at DESC 
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    feedback_list = []
    for r in rows:
        feedback_list.append({
            "id": r["id"],
            "branch_code": r["branch_code"],
            "branch_name": r["branch_name"],
            "customer_name": r["customer_name"],
            "customer_mobile": r["customer_mobile"] or "",
            "rating": r["rating"],
            "improvement_tags": json.loads(r["improvement_tags"]) if r["improvement_tags"] else [],
            "comments": r["comments"] or "",
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "created_at": r["created_at"],
        })

    conn.close()
    return {
        "data": feedback_list,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit,
    }


@app.get("/api/feedback/analytics")
async def get_analytics(branch_code: Optional[str] = None):
    """Get feedback analytics/statistics."""
    conn = get_db()

    where = ""
    params = []
    if branch_code:
        where = " WHERE branch_code = ?"
        params = [branch_code]

    # Overall stats
    stats = conn.execute(
        f"""SELECT 
            COUNT(*) as total_feedback,
            ROUND(AVG(rating), 1) as avg_rating,
            SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_count,
            SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_count
        FROM feedback{where}""",
        params,
    ).fetchone()

    # Today's count
    today = datetime.now().strftime("%Y-%m-%d")
    today_params = [today] + params
    today_where = f" WHERE created_at >= ?" + (" AND branch_code = ?" if branch_code else "")
    today_stats = conn.execute(
        f"SELECT COUNT(*) as today_count FROM feedback{today_where}",
        today_params,
    ).fetchone()

    # Rating distribution
    rating_dist = conn.execute(
        f"""SELECT rating, COUNT(*) as count 
            FROM feedback{where} 
            GROUP BY rating ORDER BY rating""",
        params,
    ).fetchall()

    # Top improvement tags
    all_tags = conn.execute(
        f"SELECT improvement_tags FROM feedback{where}",
        params,
    ).fetchall()

    tag_counts = {}
    for row in all_tags:
        tags = json.loads(row["improvement_tags"]) if row["improvement_tags"] else []
        for tag in tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    top_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    # Branch-wise breakdown
    branch_stats = conn.execute(
        """SELECT b.code, b.name, 
            COUNT(f.id) as total,
            ROUND(AVG(f.rating), 1) as avg_rating
        FROM branches b
        LEFT JOIN feedback f ON b.code = f.branch_code
        GROUP BY b.code
        ORDER BY total DESC"""
    ).fetchall()

    # Last 7 days trend
    trend_data = []
    for i in range(6, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        day_params = [d, d + " 23:59:59"] + params
        day_where = " WHERE created_at >= ? AND created_at <= ?" + (" AND branch_code = ?" if branch_code else "")
        row = conn.execute(
            f"SELECT COUNT(*) as count, ROUND(AVG(rating), 1) as avg FROM feedback{day_where}",
            day_params,
        ).fetchone()
        trend_data.append({
            "date": d,
            "count": row["count"],
            "avg_rating": row["avg"] or 0,
        })

    conn.close()

    return {
        "total_feedback": stats["total_feedback"],
        "avg_rating": stats["avg_rating"] or 0,
        "positive_count": stats["positive_count"] or 0,
        "negative_count": stats["negative_count"] or 0,
        "today_count": today_stats["today_count"],
        "rating_distribution": {str(r["rating"]): r["count"] for r in rating_dist},
        "top_improvement_tags": [{"tag": t[0], "count": t[1]} for t in top_tags],
        "branch_stats": [
            {"code": r["code"], "name": r["name"], "total": r["total"], "avg_rating": r["avg_rating"] or 0}
            for r in branch_stats
        ],
        "trend": trend_data,
    }


@app.get("/api/qr/{branch_code}")
async def get_qr_code(branch_code: str):
    """Generate and return QR code image for a branch."""
    conn = get_db()
    branch = conn.execute(
        "SELECT name FROM branches WHERE code = ?", (branch_code,)
    ).fetchone()
    conn.close()

    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Generate QR code pointing to feedback form
    feedback_url = f"{BASE_URL}/index.html?branch={branch_code}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=3,
    )
    qr.add_data(feedback_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#1b2d5a", back_color="white")

    # Save to file
    filepath = os.path.join(QR_DIR, f"qr_{branch_code}.png")
    img.save(filepath)

    # Return as response
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/barcode/{branch_code}")
async def get_barcode(branch_code: str):
    """Generate and return barcode image for a branch."""
    conn = get_db()
    branch = conn.execute(
        "SELECT name FROM branches WHERE code = ?", (branch_code,)
    ).fetchone()
    conn.close()

    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Generate Code128 barcode with the branch code
    code128 = barcode.get_barcode_class('code128')
    barcode_data = f"PH-{branch_code}"
    writer = ImageWriter()
    writer.set_options({
        'module_width': 0.4,
        'module_height': 18.0,
        'font_size': 12,
        'text_distance': 5.0,
        'quiet_zone': 6.5,
    })
    bc = code128(barcode_data, writer=writer)

    buf = io.BytesIO()
    bc.write(buf)
    buf.seek(0)

    return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/qr-all")
async def get_all_qr_codes():
    """Get QR code download links for all branches."""
    conn = get_db()
    branches = conn.execute("SELECT code, name FROM branches ORDER BY code").fetchall()
    conn.close()

    result = []
    for b in branches:
        result.append({
            "code": b["code"],
            "name": b["name"],
            "qr_url": f"/api/qr/{b['code']}",
            "feedback_url": f"{BASE_URL}/index.html?branch={b['code']}",
        })
    return result


@app.get("/api/feedback/export")
async def export_feedback_csv(branch_code: Optional[str] = None):
    """Export feedback as CSV."""
    conn = get_db()

    where = ""
    params = []
    if branch_code:
        where = " WHERE f.branch_code = ?"
        params = [branch_code]

    rows = conn.execute(
        f"""SELECT f.*, b.name as branch_name 
            FROM feedback f 
            JOIN branches b ON f.branch_code = b.code
            {where}
            ORDER BY f.created_at DESC""",
        params,
    ).fetchall()
    conn.close()

    # Build CSV
    csv_lines = ["ID,Branch Code,Branch Name,Customer Name,Mobile,Rating,Improvement Tags,Comments,Latitude,Longitude,Date"]
    for r in rows:
        tags = json.loads(r["improvement_tags"]) if r["improvement_tags"] else []
        csv_lines.append(
            f'{r["id"]},{r["branch_code"]},"{r["branch_name"]}","{r["customer_name"]}",{r["customer_mobile"] or ""},{ r["rating"]},"{"; ".join(tags)}","{(r["comments"] or "").replace(chr(34), chr(39))}",{r["latitude"] or ""},{r["longitude"] or ""},{r["created_at"]}'
        )

    csv_content = "\n".join(csv_lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=feedback_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"},
    )


# ─── Serve Frontend ───────────────────────────────────────
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ─── Run ───────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8585))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
