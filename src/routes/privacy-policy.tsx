import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";
import { company } from "@/data/properties";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Brachtia Homes" },
      {
        name: "description",
        content:
          "How Brachtia Homes collects, uses, and protects your personal information when you use our website and services.",
      },
      { property: "og:title", content: "Privacy Policy — Brachtia Homes" },
      {
        property: "og:description",
        content:
          "How Brachtia Homes collects, uses, and protects your personal information when you use our website and services.",
      },
      { property: "og:url", content: `${SITE_URL}/privacy-policy` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: SOCIAL_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: SOCIAL_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy-policy` }],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const lastUpdated = "4 September 2026";
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-brand-deep sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/80">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            1. Information We Collect
          </h2>
          <p className="mt-2">
            We may collect personal information that you voluntarily provide
            when you use our website, fill out forms, or contact us. This
            includes your name, email address, company name, phone number, and
            any other details you choose to share.
          </p>
          <p className="mt-2">
            We also automatically collect certain technical data such as your IP
            address, browser type, device information, and pages visited through
            cookies and similar technologies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            2. How We Use Your Information
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>To respond to your enquiries and provide our services</li>
            <li>
              To send relevant communications about our services or events
            </li>
            <li>To improve our website experience and analyse usage patterns</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Data Sharing
          </h2>
          <p className="mt-2">
            We do not sell your personal data. We may share information with
            trusted third-party service providers (e.g. analytics, email
            delivery) who assist us in operating our website and services,
            subject to confidentiality obligations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Cookies & Analytics
          </h2>
          <p className="mt-2">
            We use Google Analytics and similar tools to understand how visitors
            interact with our website. You can manage cookie preferences through
            your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. Data Retention
          </h2>
          <p className="mt-2">
            We retain your personal information only for as long as necessary to
            fulfil the purposes outlined in this policy, or as required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            6. Your Rights
          </h2>
          <p className="mt-2">
            You may request access to, correction of, or deletion of your
            personal data at any time by contacting us at{" "}
            <a
              href={`mailto:${company.email}`}
              className="font-medium text-brand underline underline-offset-2 hover:text-brand-deep"
            >
              {company.email}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            7. Contact Us
          </h2>
          <p className="mt-2">
            If you have questions about this Privacy Policy, please contact us
            at{" "}
            <a
              href={`mailto:${company.email}`}
              className="font-medium text-brand underline underline-offset-2 hover:text-brand-deep"
            >
              {company.email}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
