import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import { plusIcon, layersIcon } from "./icons";

export default function ConstructiesTab() {
  const { t } = useTranslation("ribbon");
  const navigate = useNavigate();

  return (
    <>
      <RibbonGroup label={t("constructies.constructions")}>
        <RibbonButton
          icon={plusIcon}
          label={t("constructies.newConstruction")}
          onClick={() => navigate("/rc")}
        />
        <RibbonButton
          icon={layersIcon}
          label={t("constructies.catalogue")}
          onClick={() => navigate("/constructies")}
        />
      </RibbonGroup>
    </>
  );
}
