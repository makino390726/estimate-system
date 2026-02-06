'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/selectors');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />

        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            見積システム
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            商品・担当者・顧客の各マスタを管理し、見積書を作成します。
          </p>
        </div>

        {/* メインメニュー */}
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            href="/selectors"
            className="btn-3d btn-search inline-block rounded-full bg-foreground px-8 py-3 text-lg text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            📋 マスタ選択メニュー
          </Link>
        </div>

        {/* クイックリンク */}
        <div className="mt-24 max-w-3xl" style={{ width: "100%" }}>
          <h3 className="text-xl font-semibold text-black dark:text-zinc-50">
            クイックアクセス
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            <Link href="/products" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  商品マスタ
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  商品の検索・登録・修正・削除
                </p>
              </div>
            </Link>

            <Link href="/staffs" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  担当者マスタ
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  担当者の検索・登録・修正・削除
                </p>
              </div>
            </Link>

            <Link href="/customers/select" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  顧客マスタ
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  顧客の検索・登録・修正・削除
                </p>
              </div>
            </Link>

            <Link href="/cases/import-excel" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  📥 Excel見積インポート
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  Excelファイルから見積書を取込
                </p>
              </div>
            </Link>

            <Link href="/cases/list" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  見積一覧
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  作成済み見積の確認・管理
                </p>
              </div>
            </Link>

            <Link href="/cases/new" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  見積新規作成
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  新しい見積書を手作業で作成
                </p>
              </div>
            </Link>

            <Link href="/settlement-rules" className="selector-card">
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  📋 決済ルール管理
                </h4>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: 13,
                    color: "#777",
                  }}
                >
                  営業所別の決済ルールPDFを管理
                </p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
