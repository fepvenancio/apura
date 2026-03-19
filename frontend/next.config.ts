import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Dynamic routes ([token], [id]) use revalidate=0 in their server page wrapper
  // to bypass the generateStaticParams requirement for output: "export".
  // These routes render as dynamic (ƒ) and work client-side via useParams().
};

export default withNextIntl(nextConfig);
