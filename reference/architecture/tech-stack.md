# Tech Stack & UI Aesthetics

## 3. Tech Stack

- **Framework**: Next.js App Router (using API routes to interface with the local file system).
- **Styling**: Tailwind CSS v4.
- **Components**: `shadcn/ui` (accessible, customizable, and unstyled base components).
- **Icons**: `lucide-react`.

## 4. UI/UX Aesthetics

- **Premium Feel**: The application is designed dark-first using deep slates for surfaces, glassmorphism, subtle borders, and smooth transitions (`transition-all`). The actual runtime theme follows the user's OS preference: `next-themes` is configured with `defaultTheme="system"` + `enableSystem` (see `src/app/layout.tsx`), so the app renders dark when the OS is dark and light when the OS is light. The visual canvas surface stays white in both themes for Mermaid readability.
- **Micro-interactions**: Components like cards and nodes have hover states, subtle scaling, and opacity changes to feel alive and responsive.
- **No Placeholders**: We use functional, aesthetic components instead of generic placeholders.
- **Full Design Specification**: Complete color tokens, typography scale, component styles, and interaction guidelines are in `reference/standards/design.md`. Always consult it before adding new UI surfaces.
