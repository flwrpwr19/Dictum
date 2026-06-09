import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dictum",
};

export default function PillLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body {
              overflow: hidden !important;
              height: 100% !important;
              width: 100% !important;
              margin: 0 !important;
              background: transparent !important;
            }
            body > * {
              overflow: hidden !important;
            }
            nextjs-portal,
            [data-nextjs-toast],
            [data-nextjs-dialog],
            #__next-build-watcher,
            .nextjs-toast-errors-parent {
              display: none !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          `,
        }}
      />
      {children}
    </>
  );
}
