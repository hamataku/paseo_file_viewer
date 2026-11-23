import { useSettings, useTranslation } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { preferences } from "../shared/contracts";
import { messages } from "./messages";
import type { OpenIn } from "./open-request";

export function SettingsScreen() {
  const { t } = useTranslation(messages);
  const settings = useSettings(preferences);
  if (settings.status === "loading") return <Loading />;
  if (settings.status !== "ready") return null;
  const { values, revision } = settings;
  return (
    <SettingsSection title={t("settings.behavior")}>
      <SettingsCard>
        <SettingsSwitch
          label={t("settings.linkMessages")}
          hint={t("settings.linkMessagesHint")}
          value={values.linkMessages}
          onValueChange={(linkMessages) => void settings.save({ ...values, linkMessages }, revision)}
        />
        <SettingsSwitch
          label={t("settings.detectBarePaths")}
          hint={t("settings.detectBarePathsHint")}
          value={values.detectBarePaths}
          disabled={!values.linkMessages}
          onValueChange={(detectBarePaths) => void settings.save({ ...values, detectBarePaths }, revision)}
        />
        <SettingsSwitch
          label={t("settings.instructAgents")}
          hint={t("settings.instructAgentsHint")}
          value={values.instructAgents}
          onValueChange={(instructAgents) => void settings.save({ ...values, instructAgents }, revision)}
        />
        <SettingsSelect<OpenIn>
          label={t("settings.openIn")}
          hint={t("settings.openInHint")}
          value={values.openIn}
          options={[
            { label: t("settings.auto"), value: "auto" },
            { label: t("settings.explorer"), value: "explorer" },
            { label: t("settings.workspace"), value: "workspace" },
          ]}
          onValueChange={(openIn) => void settings.save({ ...values, openIn }, revision)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
