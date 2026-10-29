// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).

import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "LiveMaid Docs",
  tagline: "A source-available two-way Mermaid diagram WYSIWYG editor",
  favicon: "img/icon.svg",

  url: "https://peter6055.github.io",
  baseUrl: "/livemaid/",

  organizationName: "peter6055",
  projectName: "livemaid",
  deploymentBranch: "gh-pages",

  onBrokenLinks: "throw",

  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "anonymous",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    },
  ],

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.js",
          editUrl: "https://github.com/peter6055/livemaid/tree/main/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: "LiveMaid Docs",
        logo: {
          alt: "LiveMaid logo",
          src: "img/icon.svg",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "docsSidebar",
            position: "left",
            label: "Docs",
          },
          {
            href: "https://github.com/peter6055/livemaid",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "light",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Introduction",
                to: "/",
              },
              {
                label: "Supported Diagrams",
                to: "/supported-diagrams",
              },
              {
                label: "Contributing",
                to: "/project/contributing",
              },
            ],
          },
          {
            title: "Project",
            items: [
              {
                label: "License",
                to: "/project/license",
              },
              {
                label: "Data Collection Notice",
                to: "/project/collection-notice",
              },
              {
                label: "Third-Party Notices",
                to: "/project/third-party-notices",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/peter6055/livemaid",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} LiveMaid. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
