import ModulePage from "./ModulePage.jsx";
import { VLOG_SEASON_MODULE } from "./Homepage/homeShared.js";

export default function VlogModulePage() {
  return (
    <ModulePage
      moduleConfig={VLOG_SEASON_MODULE}
      seasonNumber={VLOG_SEASON_MODULE.seasonNumber}
    />
  );
}
