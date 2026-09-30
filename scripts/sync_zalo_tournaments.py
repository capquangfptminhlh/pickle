import sys
import os
import time
import argparse
import sqlite3

# Add current scripts directory to path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

from extract_zalo_tournaments import export_tournaments, extract_all_tournaments, DB_PATH

def get_db_stats():
    if not os.path.exists(DB_PATH):
        return 0, 0
    try:
        con = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True)
        cur = con.cursor()
        max_id = cur.execute('SELECT MAX(id) FROM messages').fetchone()[0] or 0
        total_count = cur.execute('SELECT COUNT(*) FROM messages').fetchone()[0] or 0
        con.close()
        return max_id, total_count
    except Exception:
        return 0, 0

def run_sync(watch=False, interval=15, output_dir="assets"):
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 65)
    print("🏓 PICKLE TOUR — ZALO CRM TOURNAMENT AUTO-SYNC & BANNER OCR")
    print("=" * 65)

    if not watch:
        tours = export_tournaments(output_dir)
        p_tours = [t for t in tours if t['sport'] == 'pickleball']
        b_tours = [t for t in tours if t.get('coverUrl')]
        print(f"\n📊 Summary:")
        print(f"   • Upcoming Pickleball tournaments: {len(p_tours)}")
        print(f"   • Tournaments with real poster:    {len(b_tours)}")
        print("\n🏆 Upcoming Pickleball Tournaments with Poster / Details:")
        for i, t in enumerate(p_tours[:8]):
            banner_indicator = " [🖼️ BANNER]" if t.get('coverUrl') else ""
            print(f"   [{i+1}] {t['name']}{banner_indicator}")
            print(f"       📅 {t['date']} | 📍 {t['venue']}")
            print(f"       🏸 {t['divisionName']} | Phí: {t['entryFee']:,} đ | Thưởng: {t['prizePool']:,} đ")
            if t['contactPhone']:
                print(f"       📞 Hotline: {t['contactPhone']} ({t['contactName']})")
        return

    print(f"👀 Watching LHM CRM database for new messages & banner images every {interval}s...")
    last_max_id, last_count = get_db_stats()
    export_tournaments(output_dir)
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✅ Initial scan complete. System active and listening...\n")

    try:
        while True:
            time.sleep(interval)
            cur_max_id, cur_count = get_db_stats()
            if cur_max_id != last_max_id or cur_count != last_count:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 🔔 Detected new messages in Zalo CRM! (Max ID: {cur_max_id}, Total: {cur_count})")
                tours = export_tournaments(output_dir)
                b_count = len([t for t in tours if t.get('coverUrl')])
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 🔄 Synchronized! {len(tours)} tournaments ({b_count} with poster banners).\n")
                last_max_id = cur_max_id
                last_count = cur_count
    except KeyboardInterrupt:
        print("\n🛑 Auto-sync watcher stopped.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Auto sync Zalo tournaments from LHM CRM to Pickle Tour app")
    parser.add_argument('--watch', action='store_true', help="Watch database continuously in background")
    parser.add_argument('--interval', type=int, default=15, help="Polling interval in seconds (default 15)")
    parser.add_argument('--output', type=str, default="assets", help="Output directory for JSON/JS assets")
    args = parser.parse_args()

    run_sync(watch=args.watch, interval=args.interval, output_dir=args.output)
