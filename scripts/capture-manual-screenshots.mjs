/**

 * 取扱説明書用: 画面の一括スクリーンショット

 *

 * 推奨: 開発サーバー(npm run dev)では Next.js のビルドエラー画面が写り込むことがあるため、

 *       本番ビルドで撮影するか、本番 URL を指定してください。

 *

 * 用法 A（推奨・ローカル本番ビルド）:

 *   npm run build

 *   npx next start -p 3001

 *   set MANUAL_BASE_URL=http://localhost:3001

 *   npm run docs:capture

 *

 * 用法 B（本番サイト）:

 *   set MANUAL_BASE_URL=https://estimate-system-ten.vercel.app

 *   npm run docs:capture

 */

import fs from 'fs'

import path from 'path'

import { fileURLToPath } from 'url'

import puppeteer from 'puppeteer'



const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ROOT = path.join(__dirname, '..')

const OUT_DIR = path.join(ROOT, 'docs', 'manual', 'screenshots')



const BASE_URL = (

    process.env.MANUAL_BASE_URL || 'http://localhost:3001'

).replace(/\/$/, '')



const ERROR_PAGE_RE =

    /Build Error|Module not found|Unhandled Runtime Error|Application error|Can't resolve 'canvas'/i



/** @type {{ path: string; file: string; title: string; fullPage?: boolean; skipErrorCheck?: boolean }[]} */

const PAGES = [

    { path: '/selectors', file: '00-menu', title: 'メインメニュー' },

    { path: '/cases/new', file: '01-estimate-new', title: '見積書作成' },

    { path: '/cases/import-excel', file: '02-estimate-import-excel', title: 'Excel取込' },

    { path: '/cases/list', file: '03-cases-list', title: '案件一覧', fullPage: true },

    { path: '/cases/deal-rank', file: '04-deal-rank', title: '見込み区分' },

    { path: '/cases/approval', file: '05-approval', title: '承認依頼' },

    { path: '/settlement-rules', file: '06-settlement-rules', title: '決済ルール' },

    { path: '/cases/new/order', file: '07-order-new', title: '注文書作成' },

    { path: '/cases/orders', file: '08-orders', title: '注文受付確認' },

    { path: '/products', file: '09-products', title: '商品検索' },

    { path: '/products/price_import', file: '10-products-import', title: '商品マスタ取込' },

    { path: '/customer-register', file: '11-customer-register', title: '顧客カルテ' },

    { path: '/customers/select', file: '12-customers-master', title: '顧客マスタ' },

    { path: '/staffs', file: '13-staffs', title: '担当者マスタ' },

    { path: '/wfrehouses', file: '14-warehouses', title: '倉庫登録' },

    { path: '/warehouses/stock', file: '15-warehouse-stock', title: '在庫一覧' },

    { path: '/plan', file: '16-plan', title: '製造計画一覧' },

    { path: '/plan/staff_performance', file: '17-staff-performance', title: '担当者別実績表' },

    { path: '/cases/code-mapping', file: '18-code-mapping', title: 'コード置換設定' },

    { path: '/service-repair-reports', file: '19-service-repair-reports', title: '出張修理管理表' },

    { path: '/repair-requests', file: '20-repair-requests', title: '修理案件管理', fullPage: true },

    { path: '/repair-sales-processing', file: '21-repair-sales-processing', title: '部品等売上処理', fullPage: true },

    { path: '/machine-cards', file: '22-machine-cards', title: '機械カルテ' },

    { path: '/repair-dashboard', file: '23-repair-dashboard', title: '故障分析' },

    { path: '/repair-mobile', file: '24-repair-mobile', title: '修理対応（スマホ一覧）' },

    { path: '/lineworks-staff-notify', file: '25-lineworks-staff-notify', title: 'LINE WORKS連携' },

    { path: '/line-staff-notify', file: '26-line-staff-notify', title: 'LINE公式連携' },

    { path: '/lineworks-staff-register', file: '27-lineworks-staff-register', title: 'LINE WORKS自己登録' },

]

/** 本番未デプロイの静的プレビュー等（MANUAL_LOCAL_URL / localhost:3001） */
const LOCAL_ONLY_PAGES = [
    { path: '/manual/liff-form-preview.html', file: '28-liff-repair-form', title: 'LINE修理依頼フォーム', skipErrorCheck: true },
]



async function stripDevOverlays(page) {

    await page.evaluate(() => {

        document

            .querySelectorAll(

                'nextjs-portal, [data-nextjs-dialog], [data-nextjs-toast], #__next-build-watcher',

            )

            .forEach((el) => el.remove())

    })

}



async function pageLooksLikeError(page) {

    const text = await page.evaluate(() => document.body?.innerText || '')

    return ERROR_PAGE_RE.test(text)

}



async function captureOne(page, item) {

    const url = `${BASE_URL}${item.path}`

    const outPath = path.join(OUT_DIR, `${item.file}.png`)



    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })

    await new Promise((r) => setTimeout(r, 2000))

    await stripDevOverlays(page)



    if (!item.skipErrorCheck && (await pageLooksLikeError(page))) {

        throw new Error(

            'ビルドエラー画面が表示されています。npm run build → npx next start -p 3001 で撮影するか、MANUAL_BASE_URL に本番 URL を指定してください',

        )

    }



    await page.screenshot({

        path: outPath,

        fullPage: Boolean(item.fullPage),

    })

    return { url, outPath }

}



async function main() {

    fs.mkdirSync(OUT_DIR, { recursive: true })



    const browser = await puppeteer.launch({

        headless: true,

        args: ['--no-sandbox', '--disable-setuid-sandbox'],

    })



    const page = await browser.newPage()

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })



    const manifest = []

    let ok = 0

    let fail = 0



    console.log(`撮影元: ${BASE_URL}\n`)



    for (const item of PAGES) {

        try {

            const { url } = await captureOne(page, item)

            manifest.push({ ...item, url, file: `${item.file}.png`, status: 'ok' })

            ok++

            console.log(`OK  ${item.file}.png  ${item.title}`)

        } catch (e) {

            const msg = e instanceof Error ? e.message : String(e)

            manifest.push({ ...item, url: `${BASE_URL}${item.path}`, file: `${item.file}.png`, status: 'fail', error: msg })

            fail++

            console.error(`NG  ${item.file}  ${msg}`)

        }

    }

    const localBase = (process.env.MANUAL_LOCAL_URL || 'http://localhost:3001').replace(/\/$/, '')
    for (const item of LOCAL_ONLY_PAGES) {
        try {
            const url = `${localBase}${item.path}`
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
            await new Promise((r) => setTimeout(r, 1000))
            await stripDevOverlays(page)
            await page.screenshot({
                path: path.join(OUT_DIR, `${item.file}.png`),
                fullPage: false,
            })
            manifest.push({ ...item, url, file: `${item.file}.png`, status: 'ok', source: 'local' })
            ok++
            console.log(`OK  ${item.file}.png  ${item.title} (local ${localBase})`)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            manifest.push({
                ...item,
                url: `${localBase}${item.path}`,
                file: `${item.file}.png`,
                status: 'fail',
                error: msg,
            })
            fail++
            console.error(`NG  ${item.file} (local)  ${msg}`)
        }
    }

    await browser.close()



    fs.writeFileSync(

        path.join(ROOT, 'docs', 'manual', 'screenshots-manifest.json'),

        JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl: BASE_URL, pages: manifest }, null, 2),

        'utf8',

    )



    console.log(`\n完了: 成功 ${ok} / 失敗 ${fail} → ${OUT_DIR}`)

    if (fail > 0) process.exitCode = 1

}



main().catch((e) => {

    console.error(e)

    process.exit(1)

})


