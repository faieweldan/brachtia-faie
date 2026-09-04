import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo";
import { company } from "@/data/properties";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Brachtia Homes" },
      {
        name: "description",
        content:
          "The terms and conditions governing your use of the Brachtia Homes website and our student accommodation services.",
      },
      { property: "og:title", content: "Terms & Conditions — Brachtia Homes" },
      {
        property: "og:description",
        content:
          "The terms and conditions governing your use of the Brachtia Homes website and our student accommodation services.",
      },
      { property: "og:url", content: `${SITE_URL}/terms-and-conditions` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: `${SITE_URL}/terms-and-conditions` },
    ],
  }),
  component: TermsAndConditionsPage,
});

function TermsAndConditionsPage() {
  const lastUpdated = "4 September 2026";
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-brand-deep sm:text-4xl">
        Terms & Conditions
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: {lastUpdated}
      </p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/80">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            1. Acceptance of Terms
          </h2>
          <p className="mt-2">
            By accessing and using this website, you accept and agree to be
            bound by these Terms and Conditions. If you do not agree, please do
            not use this website.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            2. Use of Website
          </h2>
          <p className="mt-2">
            This website is provided for informational purposes and to facilitate
            engagement with {company.legalName}'s services. You agree to use
            this website only for lawful purposes and in a manner that does not
            infringe the rights of others.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Intellectual Property
          </h2>
          <p className="mt-2">
            All content on this website — including text, graphics, logos, and
            design — is the property of {company.legalName} and is protected by
            applicable intellectual property laws. You may not reproduce,
            distribute, or create derivative works without our prior written
            consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Services & Engagements
          </h2>
          <p className="mt-2">
            Any consulting engagements or services provided by{" "}
            {company.legalName} are subject to separate agreements. The
            information on this website does not constitute a binding offer or
            contract.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. Limitation of Liability
          </h2>
          <p className="mt-2">
            {company.legalName} shall not be liable for any direct, indirect,
            incidental, or consequential damages arising from your use of this
            website or reliance on any information provided herein.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            6. Third-Party Links
          </h2>
          <p className="mt-2">
            This website may contain links to third-party websites. We are not
            responsible for the content, privacy practices, or availability of
            those websites.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            7. Changes to Terms
          </h2>
          <p className="mt-2">
            We reserve the right to update these Terms at any time. Continued
            use of the website after changes constitutes acceptance of the
            revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            8. Governing Law
          </h2>
          <p className="mt-2">
            These Terms are governed by the laws of Malaysia. Any disputes shall
            be subject to the exclusive jurisdiction of the courts of Malaysia.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
          <p className="mt-2">
            For questions about these Terms, contact us at{" "}
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
