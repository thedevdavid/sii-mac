import { NoProfileSelected } from "@/components/no-profile-selected";
import { createFileRoute } from "@tanstack/react-router";
import { SaveEditor } from "@/features/editor/save-editor";
import { useProfileState } from "@/lib/profile-context";
import { prettifySaveDir } from "@/lib/save-utils";
import { SavePathSchema } from "@/lib/core-types";

export const Route = createFileRoute("/editor/$saveId")({
  component: EditorPage,
});

function EditorPage() {
  const { saveId } = Route.useParams();
  const { selectedProfile } = useProfileState();

  if (!selectedProfile) {
    return <NoProfileSelected />;
  }

  const savePath = SavePathSchema.parse(`${selectedProfile.path}/save/${saveId}`);
  const saveName = prettifySaveDir(saveId);

  return <SaveEditor savePath={savePath} saveName={saveName} />;
}
