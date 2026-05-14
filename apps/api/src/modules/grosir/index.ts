import { registerModule } from "../registry";
import { grosirRouter } from "./routes";

registerModule({ sector: "grosir", router: grosirRouter });

export { grosirRouter };
