-- Seed mínimo para pruebas manuales (HU-01..HU-05).
-- El panel de administrador queda fuera de este sprint, así que los
-- códigos de proveedor se poblan aquí, como indica el documento de la épica.

INSERT INTO provider_codes (code, used) VALUES
  ('PROV-1001', FALSE),
  ('PROV-1002', FALSE),
  ('PROV-1003', FALSE),
  ('QR-BELLEZA-01', FALSE),
  ('QR-SALUD-01', FALSE)
ON CONFLICT (code) DO NOTHING;

-- No se inserta un usuario demo con contraseña fija aquí porque el hash de
-- bcrypt no se puede generar de forma determinista en SQL puro.
-- Usa el script incluido para crear un usuario de prueba ya verificado:
--   npm run seed:user -- --email cliente@demo.com --password "Demo123!" --name "Camila Restrepo" --role cliente
-- Ver README.md, sección "Datos de prueba".
