import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Land at `/editor/$saveId` → redirect to the player tab so the URL always
 * names the active section. Browser back from the player tab returns to the
 * referrer (saves list) instead of bouncing through this index.
 */
export const Route = createFileRoute("/editor/$saveId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/editor/$saveId/player",
      params,
      replace: true,
    });
  },
});
