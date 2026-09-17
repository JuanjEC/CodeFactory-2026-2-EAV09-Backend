import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.port, () => {
  console.log(`API de Quiero Reservar escuchando en http://localhost:${config.port}`);
});
