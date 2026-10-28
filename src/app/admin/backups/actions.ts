"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import {
  BackupError,
  backupStore,
  createStoredBackup,
  isBackupName,
  restoreStoredBackup,
} from "@/lib/backup";
import { type FormState, formError, str } from "@/lib/form";
import { getSettings, SETTINGS_TAG, saveSettings } from "@/lib/options";
import { assertCap } from "@/lib/session";

const CAP = "manage_options";

export async function createBackupAction(
  _: FormState,
  __: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const name = await createStoredBackup();
    refresh();
    return { message: `Backup ${name} is ready.` };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteBackupAction(formData: FormData) {
  await assertCap(CAP);
  const name = str(formData, "name");
  if (isBackupName(name)) await backupStore().remove(name);
  refresh();
}

export async function restoreStoredBackupAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const { title } = await getSettings();
    if (str(formData, "confirm").trim() !== title.trim())
      throw new BackupError(`Type the site title, “${title}”, to confirm.`);
    let safety = "";
    const result = await restoreStoredBackup(str(formData, "name"), {
      beforeReplace: async () => {
        safety = await createStoredBackup("before-restore");
      },
    });
    after(async () => {
      const { embeddingsConfigured, rebuildIndex } = await import(
        "@/lib/ai/embeddings"
      );
      if (embeddingsConfigured()) await rebuildIndex();
    });
    refresh();
    return {
      message: `Restored the backup from ${new Date(result.from).toLocaleString("en")}: ${result.rows} rows and ${result.files} files. The site as it was is saved as ${safety}.`,
    };
  } catch (error) {
    return formError(error);
  }
}

export async function saveBackupSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const schedule = str(formData, "backupSchedule");
    const keep = Number(str(formData, "backupKeep"));
    if (!Number.isInteger(keep) || keep < 1 || keep > 90)
      throw new Error("Keep between 1 and 90 backups.");
    await saveSettings({
      backupSchedule:
        schedule === "daily" || schedule === "weekly" ? schedule : "off",
      backupKeep: keep,
    });
  } catch (error) {
    return formError(error);
  }
  updateTag(SETTINGS_TAG);
  return { message: "Settings saved." };
}
