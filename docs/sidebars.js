// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    "intro",
    "supported-diagrams",
    {
      type: "category",
      label: "Deployment",
      items: ["deployment/docker", "deployment/demo-mode", "deployment/oidc-setup"],
    },
    {
      type: "category",
      label: "Project",
      items: [
        "project/license",
        "project/contributing",
        "project/commercial-use",
        "project/collection-notice",
        "project/third-party-notices",
      ],
    },
  ],
};

export default sidebars;
