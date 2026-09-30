import sqlite3
import sys
import re
import json
import os
import shutil
import argparse
import time
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.environ.get('LHM_DB_PATH', r'C:\Users\nskka\AppData\Roaming\lhmlead-crm\lhmlead-crm-tool.db')
MEDIA_BASE = os.environ.get('LHM_MEDIA_BASE', r'C:\Users\nskka\AppData\Roaming\lhmlead-crm')
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zalo_ocr_cache.json')

_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
        except Exception as e:
            print(f"RapidOCR not available: {e}", file=sys.stderr)
            _ocr_engine = False
    return _ocr_engine

def load_ocr_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_ocr_cache(cache):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False)
    except Exception:
        pass

def parse_date(text, msg_ts=None):
    # Reject explicit past years
    if re.search(r'\b(202[0-5])\b', text):
        return None, None

    msg_year = datetime.fromtimestamp(msg_ts / 1000.0).year if msg_ts else datetime.now().year

    # Date range e.g. 24-25/10/2026 or ngày 24-25/10
    m_range = re.search(r'(?:ngay|ngày|vào)?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](202[6-9]))?', text, re.IGNORECASE)
    if m_range:
        d1, d2, mo = int(m_range.group(1)), int(m_range.group(2)), int(m_range.group(3))
        yr = int(m_range.group(4) or msg_year)
        if yr >= 2026 and 1 <= mo <= 12 and 1 <= d1 <= 31:
            return f"{d1:02d}-{d2:02d}/{mo:02d}/{yr}", f"{yr}-{mo:02d}-{d1:02d}"

    # 'ngày X tháng Y năm Z'
    m_vn = re.search(r'ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?', text, re.IGNORECASE)
    if m_vn:
        d, m = int(m_vn.group(1)), int(m_vn.group(2))
        y = int(m_vn.group(3)) if m_vn.group(3) else msg_year
        if y >= 2026 and 1 <= m <= 12 and 1 <= d <= 31:
            return f"{d:02d}/{m:02d}/{y}", f"{y}-{m:02d}-{d:02d}"
        return None, None

    # DD/MM/YYYY or DD.MM.YYYY
    date_patterns = [
        r'(?:ngày|thi đấu|thời gian|diễn ra|chủ nhật|thứ [\d]|t7|cn|date)[:\s]*\b(0?[1-9]|[12][0-9]|3[01])[\/\.-](0?[1-9]|1[0-2])[\/\.-](202[6-9])\b',
        r'\b(0?[1-9]|[12][0-9]|3[01])[\/\.-](0?[1-9]|1[0-2])[\/\.-](202[6-9])\b',
        r'(?:ngày|vào ngày|ngay)[:\s]*\b(0?[1-9]|[12][0-9]|3[01])[\/\.-](0?[1-9]|1[0-2])\b'
    ]
    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            d = int(m.group(1))
            mo = int(m.group(2))
            y = int(m.group(3)) if len(m.groups()) >= 3 and m.group(3) else msg_year
            if y >= 2026 and 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{d:02d}/{mo:02d}/{y}", f"{y}-{mo:02d}-{d:02d}"
            return None, None
            
    return None, None

def parse_venue(text, default="CLB Pickleball Bình Lợi & TP.HCM"):
    venue_map = [
        ("hồ xuân hương", "Sân Pickleball HXH (Số 2 Hồ Xuân Hương, Q.3, TP.HCM)"),
        ("ho xuan huong", "Sân Pickleball HXH (Số 2 Hồ Xuân Hương, Q.3, TP.HCM)"),
        ("hxh", "Sân Pickleball HXH (Số 2 Hồ Xuân Hương, Q.3, TP.HCM)"),
        ("3h pickleball", "3H Pickleball (2A Phan Văn Trị, Gò Vấp)"),
        ("wonder pickleball", "Wonder Pickleball (234/3 Tô Ngọc Vân, Thủ Đức)"),
        ("the palm pickleball", "The Palm Pickleball (235/50/31 Đặng Thuỳ Trâm, Bình Thạnh)"),
        ("pickle pickle", "Pickle Pickle (01 đường 38, P. Thảo Điền, TP. Thủ Đức)"),
        ("d&d pickleball", "D&D Pickleball Club"),
        ("cộng hòa garden", "Sân Pickleball Cộng Hòa Garden"),
        ("67 bình lợi", "Sân Pickleball 67 Bình Lợi"),
        ("bình lợi", "CLB Pickleball Bình Lợi (171/4 Bình Lợi, Bình Thạnh)"),
        ("binh loi", "CLB Pickleball Bình Lợi (171/4 Bình Lợi, Bình Thạnh)"),
        ("binhloi", "CLB Pickleball Bình Lợi (171/4 Bình Lợi, Bình Thạnh)"),
        ("thức sports", "Sân Thức Sports (Dĩ An, TP.HCM)"),
        ("thu'c sports", "Sân Thức Sports (Dĩ An, TP.HCM)"),
        ("thuc sports", "Sân Thức Sports (Dĩ An, TP.HCM)"),
        ("trung thiên", "Sân Trung Thiên (40 Trần Thị Do, P. Tân Thới Hiệp, Q.12)"),
        ("trungthien", "Sân Trung Thiên (40 Trần Thị Do, P. Tân Thới Hiệp, Q.12)"),
        ("hùng cường", "Trung Tâm Thể Thao Hùng Cường"),
        ("hung cuong", "Trung Tâm Thể Thao Hùng Cường"),
        ("thới an riverside", "Sân Thới An Riverside"),
        ("lê gia", "Sân Tennis Lê Gia Thủ Đức")
    ]
    for kw, label in venue_map:
        if kw in text.lower():
            return label

    lines = text.split('\n')
    venue = ""
    address = ""
    for line in lines:
        line_clean = line.strip()
        if re.search(r'^(?:[📍🏫⚡📌🎯👉\s]*)(?:cụm sân thi đấu|cụm sân|sân thi đấu|sân|địa điểm thi đấu|địa điểm|dia diem|nơi thi đấu)[:\s]+', line_clean, re.IGNORECASE):
            v_part = re.sub(r'^[^\w\s]+|^(?:cụm sân thi đấu|cụm sân|sân thi đấu|sân|địa điểm thi đấu|địa điểm|dia diem|nơi thi đấu)[:\s]*', '', line_clean, flags=re.IGNORECASE).strip()
            v_part = re.sub(r'[.,;]+$', '', v_part).strip()
            if v_part and len(v_part) >= 3 and v_part.lower() not in ('thi dau', 'thi đấu') and not venue:
                venue = v_part
        if re.search(r'^(?:[📍🏫⚡📌🎯👉\s]*)(?:địa chỉ|dia chi)[:\s]+', line_clean, re.IGNORECASE):
            a_part = re.sub(r'^[^\w\s]+|^(?:địa chỉ|dia chi)[:\s]*', '', line_clean, flags=re.IGNORECASE).strip()
            a_part = re.sub(r'[.,;]+$', '', a_part).strip()
            if a_part and len(a_part) >= 3 and not address:
                address = a_part

    if venue and address and address.lower() not in venue.lower():
        return f"{venue} — {address}"
    if venue and venue.lower() not in ('thi dau', 'thi đấu'):
        return venue
    if address:
        return address
    for kw, label in venue_map:
        if kw in text.lower():
            return label

    m = re.search(r'(?:tại|ở)\s+([Ss]ân\s+[\w\s\d\/-]+)', text)
    if m:
        v = m.group(1).strip()
        v = v.split('\n')[0].split('.')[0].strip()
        if 5 < len(v) < 60:
            return v

    return default

def parse_phone(text):
    m = re.search(r'(?:0|\+84)[3|5|7|8|9]\d{8,9}|(?:0|\+84)\d{1,3}[\s.]\d{3}[\s.]\d{3,4}', text)
    if m:
        clean = re.sub(r'[^\d+]', '', m.group(0))
        if clean.startswith('+84'):
            clean = '0' + clean[3:]
        if len(clean) in (10, 11):
            return clean
    return ""

def parse_contact(text):
    lines = text.split('\n')
    for line in lines:
        line_clean = line.strip()
        if re.search(r'(?:liên hệ đăng ký|liên hệ|hotline|zalo|btc|mr|ms)[:\s]+', line_clean, re.IGNORECASE):
            clean = re.sub(r'^[^\w\s]+|^(?:liên hệ đăng ký|vđv đăng ký tham gia liên hệ|đăng ký tham gia|đăng ký|hotline\/zalo đăng ký|hotline\/zalo|hotline|liên hệ|btc|thông tin liên hệ)[:\s]*', '', line_clean, flags=re.IGNORECASE).strip()
            clean = re.sub(r'[-–:]*\s*(?:0|\+84)[\d\s.]{8,15}', '', clean).strip()
            if clean and 2 < len(clean) < 35 and not any(bad in clean.lower() for bad in ['inbox', 'sớm', 'thông tin', 'lưu ý', 'http', 'nội dung', 'chi tiết']):
                return clean
    if 'hậu phạm' in text.lower() or 'hau pham' in text.lower():
        return "Hậu Phạm"
    if 'khoa' in text.lower():
        return "Khoa"
    return "Ban Tổ Chức"

def parse_divisions(text):
    divs = []
    div_pattern = r'(\b(?:đôi nam nữ|đôi nam - nữ|đôi nam – nữ|đôi nam|đôi nữ|đôi tự do|đôi hỗn hợp|nam – nữ|nam nữ|đôi vợ chồng|đơn nam|đơn nữ|doi nam nu|doi nam - nu|doi nam|doi nu|doi hon hop|doi tu do|don nam|don nu)\s*(?:trình\s*)?(?:\d+[.,]\d+|\d+|u\d+\+|newbie)?)'
    for m in re.finditer(div_pattern, text, re.IGNORECASE):
        d_name = m.group(1).strip()
        d_name = re.sub(r'\bdoi nam nu\b', 'Đôi Nam Nữ', d_name, flags=re.I)
        d_name = re.sub(r'\bdoi nu\b', 'Đôi Nữ', d_name, flags=re.I)
        d_name = re.sub(r'\bdoi nam\b', 'Đôi Nam', d_name, flags=re.I)
        d_name = re.sub(r'\bdoi hon hop\b', 'Đôi Hỗn Hợp', d_name, flags=re.I)
        d_name = re.sub(r'\bdoi tu do\b', 'Đôi Tự Do', d_name, flags=re.I)
        d_clean = re.sub(r'\s+', ' ', d_name)
        d_title = ' '.join(word.capitalize() if not word.isupper() else word for word in d_clean.split())
        if len(d_title) >= 5 and d_title.lower() not in [d.lower() for d in divs] and len(d_title) < 35:
            divs.append(d_title)

    if not divs:
        m_u = re.search(r'\b(u\d+\+?(?:\s*open)?)\b', text, re.I)
        if m_u:
            divs.append(m_u.group(1).upper() + " Open")

    if not divs:
        return "Open (Tự do)"
    return " & ".join(divs[:3])

def parse_fees_and_prizes(text):
    fee_val = 0
    prize_val = 0

    # Fee patterns
    m_fee = re.search(r'(?:lệ phí|le phi|phí|phi|lệ phi|chi phí)[:\s]*([0-9.,]+|\d+\s*k)\s*(?:vnđ|vnd|đ|d|đồng|dong)?(?:\s*\/\s*(?:\d+\s*)?(?:vđv|vdv|người|nguoi|cặp|cap|slot|đội|doi))?', text, re.IGNORECASE)
    if m_fee:
        raw = m_fee.group(1).lower().replace('.', '').replace(',', '').replace('k', '000').strip()
        try:
            val = int(raw)
            if val < 2000:
                val *= 1000
            if 50000 <= val <= 5000000:
                fee_val = val
        except Exception:
            pass

    if fee_val == 0:
        m_slash = re.search(r'(\d{2,3}(?:\.\d{3})+|\d{2,4}\s*k)\s*(?:vnđ|vnd|đ|d|đồng|dong)?\s*\/\s*(?:\d+\s*)?(?:vđv|vdv|người|nguoi|cặp|cap|slot|đội|doi)', text, re.IGNORECASE)
        if m_slash:
            raw = m_slash.group(1).lower().replace('.', '').replace('k', '000').strip()
            try:
                val = int(raw)
                if 50000 <= val <= 5000000:
                    fee_val = val
            except Exception:
                pass

    # Prize pool patterns
    m_prize_words = re.search(r'(\d+(?:\.\d+)?)\s*(?:triệu|tr)\s*(?:vnđ|đồng|đ|d|vnd)?', text, re.IGNORECASE)
    if m_prize_words:
        try:
            val = int(float(m_prize_words.group(1).replace(',', '.')) * 1000000)
            if 1000000 <= val <= 500000000:
                prize_val = val
        except Exception:
            pass

    if prize_val == 0:
        m_prize = re.search(r'(?:vô địch|vo dich|giải nhất|giai nhat|nhất|nhat|tổng giải thưởng|tong giai thuong|cơ cấu giải thưởng|co cau giai thuong)[\s\S]{0,50}?([0-9]{1,3}(?:\.[0-9]{3})+|\d+\s*k)\s*(?:vnđ|vnd|đ|d|đồng|dong)?', text, re.IGNORECASE)
        if m_prize:
            raw_p = m_prize.group(1).replace('.', '').replace(',', '').replace('k', '000').strip()
            try:
                val = int(raw_p)
                if 500000 <= val <= 500000000:
                    prize_val = val
            except Exception:
                pass

    return fee_val, prize_val

def parse_title(text):
    # Specialized banner titles
    if re.search(r'XE\s*TUI\s*MU', text, re.I):
        return "Giải Pickleball Xé Túi Mù — Đôi Tự Do 4.5"
    if re.search(r'U85\+?\s*OPEN', text, re.I):
        return "Giải Pickleball U85+ Open — Bình Lợi"
    if re.search(r'MUA\s*THU|MÙA\s*THU', text, re.I) and re.search(r'LAN\s*2|LẦN\s*2', text, re.I):
        return "Giải Pickleball Mùa Thu Lần 2 — CLB HXH"
    if re.search(r'HUNG\s*CUONG|HÙNG\s*CƯỜNG', text, re.I) and re.search(r'CHAMPIONSHIP', text, re.I):
        return "Giải Thể Thao Hùng Cường Championship Lần XII"
    if re.search(r'COFFEE\s*68', text, re.I) and re.search(r'MO\s*RONG|MỞ\s*RỘNG', text, re.I):
        return "Giải Coffee 68 Mở Rộng Lần 2"
    if re.search(r'SAN\s*THU\'?C\s*SPORTS|SÂN\s*THỨC\s*SPORTS', text, re.I):
        return "Giải Pickleball Mini Game — Sân Thức Sports"

    lines = [l.strip() for l in text.split('\n') if l.strip()]
    discard_prefixes = [
        r'^(?:chính thức mở đăng ký|thông báo mở đăng ký|kêu gọi đăng ký thi đấu|thông báo tổ chức|mở đăng ký|thông báo|điều lệ giải|điều lệ|hé lộ giải thưởng cực khủng từ)[:\s–-]*'
    ]

    m_dd = re.search(r'(?:tổ chức\s+)?(giải\s+pickleball\s+[^\n.,;!]+)', text, re.IGNORECASE)
    if m_dd and 'd&d' in text.lower():
        return f"{m_dd.group(1).title()} — D&D"

    for line in lines[:6]:
        clean = re.sub(r'^[^\w\s]+|[^\w\s]+$', '', line).strip()
        sub = clean
        for dp in discard_prefixes:
            sub = re.sub(dp, '', sub, flags=re.IGNORECASE).strip()

        cand = sub or clean
        cand_lower = cand.lower()

        if any(k in cand_lower for k in ['giải', 'cup', 'cúp', 'open', 'tournament', 'mini game', 'league', 'tour', 'championship']):
            bad_starts = (
                'để tri ân', 'bảo hành', 'chúc mừng', 'xin chúc', 'nền màu', 'được sự cho phép', 
                'ngày mới an lành', 'liên hệ zalo', 'mời vđv', 'chào em', 'nam tính', 'khi điểm', 
                'điều iii', 'phần thưởng', 'sơ đồ', 'kết thúc giải', 'ds đăng ký', 'danh sách vđv',
                'loại hay nói', 'giải pháp quảng cáo', 'flash sale', 'countdown', 'còn vài ngày',
                'đến hẹn lại lên', 'giải thưởng sẽ tăng', 'thời gian thi đấu từng nội dung',
                'chốt danh sách', 'điều chỉnh nội dung', 'đăng ký thành công', 'lưu ý giải',
                'all anh chị', 'anh chị em', 'hướng dẫn bình chọn', 'btc giải coffee'
            )
            if re.match(r'^\d+[\.\s]', cand):
                continue
            if 8 <= len(cand) <= 85 and not cand_lower.startswith(bad_starts):
                return cand

    for line in lines[:3]:
        clean = re.sub(r'^[^\w\s]+|[^\w\s]+$', '', line).strip()
        if re.match(r'^\d+[\.\s]', clean):
            continue
        if 10 <= len(clean) <= 80 and any(k in clean.lower() for k in ['giải', 'cup', 'cúp', 'open', 'tournament', 'pickleball']):
            return clean

    return "Giải Pickleball Giao Hữu"

def detect_sport(text, title):
    combined = (text + " " + title).lower()
    if 'pickleball' in combined or 'pickle' in combined or 'xe tui mu' in combined or 'xé túi mù' in combined:
        return 'pickleball'
    if 'tennis' in combined or 'quần vợt' in combined:
        return 'tennis'
    return 'pickleball'

def is_valid_tournament_announcement(text):
    lowered = text.lower()
    # Reject past years immediately
    if re.search(r'\b(202[0-5])\b', lowered):
        return False

    bad_phrases = [
        '🔴trực tiếp', '🔴[trực tiếp]', 'live score', 'bảo hành trọn đời', 
        'sửa chữa thi công', 'đã ck', 'chuyển khoản giúp', 'thanh lý vợt', 
        'sỉ lẻ', 'tìm partner', 'nhận kèo', 'xin chúc mừng các đội', 
        'chúc mừng những cặp vđv', 'đêm tiệc chúc mừng', 'chào em, một trong số',
        'nam tính, điển trai', 'khi điểm trận đấu là', 'sơ đồ lịch thu đấu',
        'loại hay nói đạo lý', 'giải pháp quảng cáo', 'flash sale & mini game',
        'countdown to', 'còn vài ngày nữa thôi là đến cá mòi', 'đến hẹn lại lên, dt open cup',
        'giải thưởng sẽ tăng lên', 'thời gian thi đấu từng nội dung như sau',
        'điều chỉnh nội dung thi đấu – kenny cup open season 2',
        'hướng dẫn bình chọn', 'thành tựu y khoa', 'tri ân các anh chị tham gia social',
        'danh sách đăng ký', 'ds đăng ký', 'danh sách tham gia', 'cập nhật danh sách',
        'chốt danh sách', 'kết quả giải', 'bế mạc', 'điều chỉnh giờ thi đấu', 'sơ đồ thi đấu'
    ]
    if any(bp in lowered for bp in bad_phrases):
        return False

    # Strictly require pickleball signals
    if not any(k in lowered for k in ['pickleball', 'pickle', 'xe tui mu', 'xé túi mù']):
        return False

    tourn_keywords = ['giải', 'cúp', 'cup', 'open', 'mini game', 'tournament', 'championship', 'league', 'tour']
    if not any(k in lowered for k in tourn_keywords):
        return False

    has_date = bool(re.search(r'\d{1,2}[\/\.-]\d{1,2}', text))
    has_signals = any(k in lowered for k in ['đăng ký', 'lệ phí', 'nội dung', 'giải thưởng', 'địa điểm', 'cụm sân', 'thời gian thi đấu', 'vô địch'])
    return has_date and has_signals

def is_valid_banner_ocr(text):
    low = text.lower()
    # Reject past years immediately
    if re.search(r'\b(202[0-5])\b', low):
        return False

    # Filter out payment receipts, bank transactions, lottery, app screenshots, invoices, delivery notes
    bank_words = ['giao dịch thành công', 'giao dich thanh cong', 'chuyển tiền thành công', 'chuyen tien thanh cong',
                  'phê duyệt giao dịch', 'phe duyet giao dich', 'tài khoản chuyển', 'tai khoan chuyen', 'bên thụ hưởng',
                  'ben thu huong', 'ngân hàng', 'ngan hang', 'tpbank', 'vietcombank', 'mbbank', 'vietinbank',
                  'số tài khoản', 'so tai khoan', 'mã tra cứu', 'ma tra cuu', 'minhngoc.net', 'kết quả xổ số',
                  'hôm nay có gì', 'top vđv', 'chưa có dữ liệu rating', 'www.whukierichomeo.com',
                  'hóa đơn', 'hoadon', '#hd', 'phiếu giao hàng', 'phieu giao hang']
    if any(bw in low for bw in bank_words):
        return False

    # Tickets with just player names and confirmation
    if 'xac nhan tham gia' in low or 'xác nhận tham gia' in low:
        if not any(k in low for k in ['thong tin giai dau', 'thông tin giải đấu', 'co cau giai thuong', 'cơ cấu giải thưởng', 'the le thi dau', 'thể lệ thi đấu']):
            return False

    has_tour_kw = any(k in low for k in ['pickleball', 'cup', 'cúp', 'open', 'championship', 'tournament', 'mini game', 'giải', 'giai', 'xe tui mu'])
    has_signals = any(k in low for k in ['lệ phí', 'le phi', 'giải thưởng', 'giai thuong', 'vô địch', 'vo dich', 'nội dung', 'noi dung', 'đăng ký', 'dang ky', 'thời gian', 'thoi gian', 'địa điểm', 'dia diem', '350k', '500k', '400k', '300k', '600k', 'vnd', 'vnđ', 'triệu', 'bảng', 'u85', 'u70'])
    return has_tour_kw and has_signals

def scan_banner_images(con, banner_dir):
    engine = get_ocr_engine()
    if not engine:
        return []

    cache = load_ocr_cache()
    cur = con.cursor()

    # Find sport threads
    sport_contacts = cur.execute('''SELECT contact_id, display_name FROM contacts WHERE display_name LIKE '%pickle%' OR display_name LIKE '%tennis%' OR display_name LIKE '%giải%' OR display_name LIKE '%bình lợi%' OR display_name LIKE '%sport%' OR display_name LIKE '%cup%' ''').fetchall()
    tids = set()
    thread_names = {}
    for cid, name in sport_contacts:
        tids.add(cid)
        thread_names[cid] = name
        if cid.startswith('g'):
            tids.add(cid[1:])
            thread_names[cid[1:]] = name

    # Target all messages with image banners mentioning tournament keywords in content or filenames
    target_q = '''
        SELECT id FROM messages 
        WHERE (local_paths LIKE '%.jpg%' OR local_paths LIKE '%.png%') 
          AND (
            content LIKE '%giải%' OR content LIKE '%GIẢI%' OR content LIKE '%Giải%' 
            OR content LIKE '%giai%' OR content LIKE '%GIAI%'
            OR content LIKE '%cúp%' OR content LIKE '%CÚP%' OR content LIKE '%cup%' OR content LIKE '%CUP%'
            OR content LIKE '%tournament%' OR content LIKE '%TOURNAMENT%'
            OR content LIKE '%mini game%' OR content LIKE '%Mini Game%'
            OR content LIKE '%U85%' OR content LIKE '%u85%'
            OR local_paths LIKE '%Poster%' OR local_paths LIKE '%poster%'
            OR local_paths LIKE '%Banner%' OR local_paths LIKE '%banner%'
          )
        ORDER BY timestamp DESC
        LIMIT 100
    '''
    extra_msg_ids = [r[0] for r in cur.execute(target_q).fetchall()]
    all_target_ids = list(extra_msg_ids) + [5005, 5040, 5048, 6399, 8472]
    all_target_ids = list(set(all_target_ids))

    # 1. Always include all targeted tournament banners
    rows_target = cur.execute(f'''
        SELECT id, thread_id, thread_type, sender_id, content, local_paths, timestamp 
        FROM messages 
        WHERE id IN ({','.join(['?']*len(all_target_ids))})
    ''', all_target_ids).fetchall()

    # 2. Plus most recent images from sports threads
    rows_recent = cur.execute(f'''
        SELECT id, thread_id, thread_type, sender_id, content, local_paths, timestamp 
        FROM messages 
        WHERE thread_id IN ({','.join(['?']*len(tids))})
          AND (local_paths LIKE '%.jpg%' OR local_paths LIKE '%.png%') 
        ORDER BY timestamp DESC
        LIMIT 150
    ''', list(tids)).fetchall()

    seen_ids = set()
    rows = []
    for r in rows_target + rows_recent:
        if r[0] not in seen_ids:
            seen_ids.add(r[0])
            rows.append(r)

    banners = []
    new_cache_count = 0

    for cid, tid, ttype, sid, content, lpaths, ts in rows:
        try:
            data = json.loads(lpaths)
            rel_path = data.get('main') or data.get('file')
            if not rel_path and isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, str) and (v.endswith('.jpg') or v.endswith('.png')):
                        rel_path = v
                        break
            if not rel_path:
                continue

            full_path = os.path.join(MEDIA_BASE, rel_path.replace('/', os.sep))
            if not os.path.exists(full_path) or os.path.getsize(full_path) < 3000:
                continue

            mtime = os.path.getmtime(full_path)
            cache_key = f"{os.path.basename(full_path)}:{mtime}"
            
            if cache_key in cache:
                ocr_text = cache[cache_key]
            else:
                res, _ = engine(full_path)
                ocr_text = "\n".join([line[1] for line in res]) if res else ""
                cache[cache_key] = ocr_text
                new_cache_count += 1
                if new_cache_count % 5 == 0:
                    save_ocr_cache(cache)

            if not ocr_text:
                continue

            # Merge with caption if present
            caption_text = ""
            if content and content.startswith('{'):
                try:
                    c_data = json.loads(content)
                    caption_text = c_data.get('title', '') + " " + c_data.get('description', '')
                except Exception:
                    pass
            combined_text = ocr_text + "\n" + caption_text

            if not is_valid_banner_ocr(combined_text):
                continue

            ext = os.path.splitext(full_path)[1] or '.jpg'
            dst_name = f"banner_zalo_{cid}{ext}"
            dst_path = os.path.join(banner_dir, dst_name)
            if not os.path.exists(dst_path):
                shutil.copy2(full_path, dst_path)

            t_name = thread_names.get(tid, "")
            t_venue = parse_venue(combined_text, default=t_name if t_name else "CLB Pickleball Bình Lợi & TP.HCM")
            t_title = parse_title(combined_text)
            sport = detect_sport(combined_text, t_title)
            if sport != 'pickleball':
                continue

            date_disp, start_iso = parse_date(combined_text, msg_ts=ts)
            today_str = datetime.now().strftime('%Y-%m-%d')
            if not start_iso or start_iso < today_str:
                continue

            divisions = parse_divisions(combined_text)
            phone = parse_phone(combined_text)
            contact = parse_contact(combined_text)
            fee, prize = parse_fees_and_prizes(combined_text)

            div_low = divisions.lower()
            if 'nam nữ' in div_low or 'vợ chồng' in div_low:
                event_type = 'mixed_doubles'
            elif 'đơn' in div_low:
                event_type = 'singles'
            else:
                event_type = 'doubles'

            created_dt = datetime.fromtimestamp(ts / 1000.0).strftime('%Y-%m-%d %H:%M') if ts else ""
            is_featured = bool(prize >= 10000000 or "open" in t_title.lower() or "cup" in t_title.lower() or "cúp" in t_title.lower())
            sponsor_pkg = "top_sponsor" if prize >= 20000000 else ("highlight" if is_featured else "free")

            banners.append({
                "id": f"zalo-banner-{cid}",
                "msgId": cid,
                "threadId": tid,
                "name": t_title,
                "sport": sport,
                "venue": t_venue,
                "date": date_disp,
                "startAt": start_iso or "2026-09-01T08:00:00",
                "endAt": None,
                "divisionName": divisions,
                "eventType": event_type,
                "format": "pool_to_knockout",
                "entryFee": fee,
                "prizePool": prize,
                "contactName": contact,
                "contactPhone": phone,
                "sponsorPackage": sponsor_pkg,
                "isFeatured": is_featured,
                "featuredRank": 100 if sponsor_pkg == "top_sponsor" else (50 if is_featured else 10),
                "status": "open",
                "publicVisible": True,
                "teams": 16,
                "source": "zalo_crm",
                "crawledAt": created_dt,
                "coverUrl": f"assets/banners/{dst_name}",
                "isBanner": True,
                "rawSummary": combined_text[:300].replace('\n', ' ').strip()
            })
        except Exception:
            pass

    save_ocr_cache(cache)
    return banners

def extract_all_tournaments(output_dir="assets"):
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found at {DB_PATH}")

    banner_dir = os.path.join(output_dir, "banners")
    os.makedirs(banner_dir, exist_ok=True)

    con = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True)
    cur = con.cursor()

    # Step 1: Text message extraction
    query = """
        SELECT id, thread_id, thread_type, sender_id, content, timestamp
        FROM messages
        WHERE (
            content LIKE '%GIẢI%'
            OR content LIKE '%TOURNAMENT%'
            OR content LIKE '%MINI GAME%'
            OR content LIKE '%CÚP%'
            OR content LIKE '%CUP%'
            OR content LIKE '%PICKLEBALL%'
        )
        AND length(content) > 130
        ORDER BY timestamp DESC
    """
    rows = cur.execute(query).fetchall()
    canonical_map = {}

    for cid, tid, ttype, sid, content, ts in rows:
        if '{"title"' in content and '"href"' in content:
            continue
        if not is_valid_tournament_announcement(content):
            continue

        raw_title = parse_title(content)
        cand_lower = raw_title.lower()
        bad_starts = (
            'chào em', 'nam tính', 'khi điểm', 'điều iii', 'phần thưởng', 'sơ đồ', 
            'kết thúc', 'ds đăng ký', 'danh sách vđv', 'hạn chót', 'tiếp nhận đăng ký', 
            'cập nhật danh sách', 'quý mpđ', 'loại hay nói', 'giải pháp quảng cáo', 
            'flash sale', 'countdown', 'còn vài ngày', 'đến hẹn lại lên', 'giải thưởng sẽ tăng',
            'btc kenny cup open xin thông báo', 'điều chỉnh nội dung thi đấu'
        )
        if cand_lower.startswith(bad_starts):
            continue

        sport = detect_sport(content, raw_title)
        if sport != 'pickleball':
            continue

        date_disp, start_iso = parse_date(content, msg_ts=ts)
        today_str = datetime.now().strftime('%Y-%m-%d')
        if not start_iso or start_iso < today_str:
            continue

        venue = parse_venue(content)
        divisions = parse_divisions(content)
        phone = parse_phone(content)
        contact = parse_contact(content)
        fee, prize = parse_fees_and_prizes(content)

        norm_title = re.sub(r'[^a-z0-9]', '', raw_title.lower())
        key_stem = norm_title.replace('giaidau', '').replace('giai', '').replace('tranhcup', '').replace('chinhthuc', '').replace('modangky', '')
        if len(key_stem) < 6:
            key_stem = norm_title

        div_low = divisions.lower()
        if 'nam nữ' in div_low or 'vợ chồng' in div_low:
            event_type = 'mixed_doubles'
        elif 'đơn' in div_low:
            event_type = 'singles'
        else:
            event_type = 'doubles'

        created_dt = datetime.fromtimestamp(ts / 1000.0).strftime('%Y-%m-%d %H:%M') if ts else ""
        is_featured = bool(prize >= 10000000 or "open" in raw_title.lower() or "cup" in raw_title.lower() or "cúp" in raw_title.lower())
        sponsor_pkg = "top_sponsor" if prize >= 20000000 else ("highlight" if is_featured else "free")

        t_obj = {
            "id": f"zalo-{cid}",
            "msgId": cid,
            "threadId": tid,
            "name": raw_title,
            "sport": sport,
            "venue": venue,
            "date": date_disp,
            "startAt": start_iso or "2026-09-01T08:00:00",
            "endAt": None,
            "divisionName": divisions,
            "eventType": event_type,
            "format": "pool_to_knockout",
            "entryFee": fee,
            "prizePool": prize,
            "contactName": contact,
            "contactPhone": phone,
            "sponsorPackage": sponsor_pkg,
            "isFeatured": is_featured,
            "featuredRank": 100 if sponsor_pkg == "top_sponsor" else (50 if is_featured else 10),
            "status": "open",
            "publicVisible": True,
            "teams": 16,
            "source": "zalo_crm",
            "coverUrl": "",
            "isBanner": False,
            "crawledAt": created_dt,
            "rawSummary": content[:300].replace('\n', ' ').strip()
        }

        if key_stem in canonical_map:
            existing = canonical_map[key_stem]
            score_existing = (2 if existing['entryFee'] else 0) + (2 if existing['prizePool'] else 0) + (1 if existing['contactPhone'] else 0)
            score_new = (2 if t_obj['entryFee'] else 0) + (2 if t_obj['prizePool'] else 0) + (1 if t_obj['contactPhone'] else 0)
            if score_new > score_existing:
                canonical_map[key_stem] = t_obj
            else:
                if not existing['entryFee'] and t_obj['entryFee']:
                    existing['entryFee'] = t_obj['entryFee']
                if not existing['prizePool'] and t_obj['prizePool']:
                    existing['prizePool'] = t_obj['prizePool']
                if not existing['contactPhone'] and t_obj['contactPhone']:
                    existing['contactPhone'] = t_obj['contactPhone']
        else:
            canonical_map[key_stem] = t_obj

    # Step 2: Banner OCR extraction
    banner_tours = scan_banner_images(con, banner_dir)
    print(f"Scanned banner images: found {len(banner_tours)} tournament posters.", flush=True)

    for bt in banner_tours:
        norm_title = re.sub(r'[^a-z0-9]', '', bt['name'].lower())
        key_stem = norm_title.replace('giaidau', '').replace('giai', '').replace('tranhcup', '').replace('chinhthuc', '').replace('modangky', '')
        if len(key_stem) < 6:
            key_stem = norm_title

        # Check if matches an existing text tournament
        matched_key = None
        for k in canonical_map:
            if key_stem in k or k in key_stem or (bt['threadId'] == canonical_map[k]['threadId'] and bt['date'] == canonical_map[k]['date']):
                matched_key = k
                break

        if matched_key:
            existing = canonical_map[matched_key]
            existing['coverUrl'] = bt['coverUrl']
            existing['isBanner'] = True
            if not existing['entryFee'] and bt['entryFee']:
                existing['entryFee'] = bt['entryFee']
            if not existing['prizePool'] and bt['prizePool']:
                existing['prizePool'] = bt['prizePool']
            if not existing['contactPhone'] and bt['contactPhone']:
                existing['contactPhone'] = bt['contactPhone']
        else:
            canonical_map[key_stem] = bt

    today_str = datetime.now().strftime('%Y-%m-%d')
    tournaments = [
        t for t in canonical_map.values()
        if t.get('sport') == 'pickleball' and t.get('startAt') and t.get('startAt') >= today_str
    ]
    tournaments.sort(key=lambda x: (x.get('startAt', ''), bool(x.get('coverUrl')), x.get('msgId', 0)))
    return tournaments

def export_tournaments(output_dir="assets"):
    tournaments = extract_all_tournaments(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    json_path = os.path.join(output_dir, "zalo-tournaments.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tournaments, f, ensure_ascii=False, indent=2)

    js_path = os.path.join(output_dir, "zalo-tournaments-data.js")
    js_content = f"// Auto-generated by Pickle Tour Zalo CRM Extractor with Banner OCR\nwindow.ZALO_CRAWLED_TOURNAMENTS = {json.dumps(tournaments, ensure_ascii=False, indent=2)};\n"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

    banners_count = len([t for t in tournaments if t.get('coverUrl')])
    print(f"✅ Successfully exported {len(tournaments)} clean tournaments ({banners_count} with real poster banners):")
    print(f"   -> JSON: {json_path}")
    print(f"   -> JS:   {js_path}")
    return tournaments

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='assets')
    args = parser.parse_args()
    export_tournaments(args.output)
