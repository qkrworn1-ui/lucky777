import asyncio, sys, io
from playwright.async_api import async_playwright
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Test on 360x800 (Galaxy S23/S24 standard) and 375x667 (iPhone SE)
        for w, h, device_name in [(360, 800, "Galaxy S23/S24 (360px)"), (375, 667, "iPhone SE (375px)")]:
            print(f"\n==================================================")
            print(f"📱 Testing Detailed Modals on {device_name}")
            print(f"==================================================")
            page = await browser.new_page(viewport={"width": w, "height": h})
            await page.goto(r'file:///d:/programing/lucky777/new/index.html')
            await asyncio.sleep(1)
            
            # Login as master
            await page.fill('#loginId', 'master')
            await page.fill('#loginPw', '0338')
            await page.click('#btnLoginSubmit')
            await asyncio.sleep(1)
            await page.click('#btnGoLotto')
            await asyncio.sleep(1)
            
            # 1. Check Main Tab Buttons
            tab_info = await page.evaluate('''() => {
                const tabs = document.querySelectorAll('.tab-btn');
                const winW = window.innerWidth;
                const overflows = [];
                tabs.forEach(t => {
                    const r = t.getBoundingClientRect();
                    if (r.right > winW + 2) overflows.push(t.innerText.trim());
                });
                return {
                    count: tabs.length,
                    overflows: overflows
                };
            }''')
            print(f"1) Main Tab Buttons: Total {tab_info['count']} tabs, Overflowing off-screen: {tab_info['overflows']}")
            
            # 2. Check User Mgmt Modal
            user_modal_info = await page.evaluate('''() => {
                const modal = document.getElementById('userMgmtModal');
                if (!modal) return { exists: false };
                modal.style.display = 'flex';
                const card = modal.querySelector('.modal-card') || modal.querySelector('.modern-card') || modal.children[0];
                const rect = card.getBoundingClientRect();
                const fits = rect.right <= window.innerWidth + 2 && rect.left >= -2;
                modal.style.display = 'none';
                return {
                    exists: true,
                    width: Math.round(rect.width),
                    fits: fits,
                    winW: window.innerWidth
                };
            }''')
            print(f"2) User Mgmt Modal: Width={user_modal_info.get('width')}px, Fits in screen({w}px): {user_modal_info.get('fits')}")
            
            # 3. Check Manual Ledger Modal
            ledger_modal_info = await page.evaluate('''() => {
                const modal = document.getElementById('manualLedgerModal');
                if (!modal) return { exists: false };
                modal.style.display = 'flex';
                const card = modal.querySelector('.modal-card') || modal.querySelector('div[style*=\"border-radius\"]') || modal.children[0];
                const rect = card ? card.getBoundingClientRect() : { width: 0, right: 0 };
                const fits = rect.right <= window.innerWidth + 2;
                modal.style.display = 'none';
                return {
                    exists: true,
                    width: Math.round(rect.width),
                    fits: fits,
                    winW: window.innerWidth
                };
            }''')
            print(f"3) Manual Ledger Modal: Width={ledger_modal_info.get('width')}px, Fits in screen({w}px): {ledger_modal_info.get('fits')}")

            # 4. Check Agreement Viewer Modal
            agr_modal_info = await page.evaluate('''() => {
                const modal = document.getElementById('agreementViewerModal');
                if (!modal) return { exists: false };
                modal.style.display = 'flex';
                const card = modal.querySelector('div[style*=\"border-radius\"]') || modal.children[0];
                const rect = card ? card.getBoundingClientRect() : { width: 0, right: 0 };
                const fits = rect.right <= window.innerWidth + 2;
                modal.style.display = 'none';
                return {
                    exists: true,
                    width: Math.round(rect.width),
                    fits: fits,
                    winW: window.innerWidth
                };
            }''')
            print(f"4) Agreement Viewer Modal: Width={agr_modal_info.get('width')}px, Fits in screen({w}px): {agr_modal_info.get('fits')}")

            # 5. Check Lotto Game Combinations Ball Display
            combo_info = await page.evaluate('''() => {
                const ballGroups = document.querySelectorAll('.game-balls, .ball-row, .lotto-numbers');
                const winW = window.innerWidth;
                let clippedCount = 0;
                ballGroups.forEach(g => {
                    const rect = g.getBoundingClientRect();
                    if (rect.right > winW + 2) clippedCount++;
                });
                return {
                    ballGroupsChecked: ballGroups.length,
                    clippedCount: clippedCount
                };
            }''')
            print(f"5) Lotto Ball Groups Checked: {combo_info['ballGroupsChecked']}, Clipped off-screen: {combo_info['clippedCount']}")
            
            await page.close()
            
        await browser.close()
        print("\nAll modal & component tests finished!")

asyncio.run(main())
