const express = require("express");
const multer = require("multer");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

// 1. CONFIGURACIÓN DE SEGURIDAD Y NUBE
const PASSWORD_ADMIN = "adminuv2026";
const SECRET_KEY = "uv_secreto_super_seguro";
const SUPABASE_URL = "https://ndhrggmljybtepzmywhd.supabase.co/"; // URL con doble gg
const SUPABASE_KEY = "sb_publishable_wihRnD1JCwjBYtLP8IkoUg_QV7APTmr";

// Inicializamos Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(cors());

// --- LÍMITES AMPLIADOS PARA ARCHIVOS 3D PESADOS ---
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. CONFIGURACIÓN DE MULTER
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// MIDDLEWARES DE AUTENTICACIÓN
app.post("/api/login", (req, res) => {
  if (req.body.password === PASSWORD_ADMIN) {
    const token = jwt.sign({ admin: true }, SECRET_KEY, { expiresIn: "2h" });
    res.json({ token });
  } else res.status(401).json({ error: "Contraseña incorrecta" });
});

const verificarToken = (req, res, next) => {
  const tokenHeader = req.headers["authorization"];
  if (!tokenHeader) return res.status(403).json({ error: "Acceso denegado" });
  const token = tokenHeader.split(" ")[1];
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Token inválido" });
    next();
  });
};

// --- RUTAS DE LA API CON SUPABASE ---

// 1. OBTENER MODELOS (Público)
app.get("/api/modelos", async (req, res) => {
  const { data, error } = await supabase
    .from("modelos")
    .select("*")
    .order("categoria", { ascending: true })
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. SUBIR NUEVO MODELO (Protegido)
app.post(
  "/api/modelos",
  verificarToken,
  upload.single("archivo3d"),
  async (req, res) => {
    // A. Extraemos todos los campos, incluyendo los nuevos
    const {
      titulo,
      descripcion,
      categoria,
      autor,
      anofabricacion,
      anollegada,
    } = req.body;
    const archivoFisico = req.file;

    // B. Subir el archivo .glb a Supabase Storage
    const nombreUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}.glb`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("modelos")
      .upload(nombreUnico, archivoFisico.buffer, {
        contentType: "application/octet-stream", // Usamos octet-stream para evitar rechazos de MIME
        upsert: false,
      });

    if (uploadError)
      return res
        .status(500)
        .json({ error: "Error subiendo archivo 3D: " + uploadError.message });

    // C. Guardar los textos y los nuevos campos en la Tabla
    const { data, error } = await supabase
      .from("modelos")
      .insert([
        {
          titulo,
          descripcion,
          categoria,
          autor,
          anofabricacion,
          anollegada,
          archivo: nombreUnico,
        },
      ])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
  },
);

// 3. EDITAR MODELO (Protegido)
app.put(
  "/api/modelos/:id",
  verificarToken,
  upload.single("archivo3d"),
  async (req, res) => {
    // A. Extraemos todos los campos también en la edición
    const {
      titulo,
      descripcion,
      categoria,
      autor,
      anofabricacion,
      anollegada,
    } = req.body;
    const id = req.params.id;
    let nombreArchivo = null;

    // Si el usuario subió un archivo nuevo al editar
    if (req.file) {
      nombreArchivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}.glb`;
      const { error: uploadError } = await supabase.storage
        .from("modelos")
        .upload(nombreArchivo, req.file.buffer, {
          contentType: "application/octet-stream",
        });

      if (uploadError)
        return res.status(500).json({ error: uploadError.message });
    }

    // Preparar qué datos vamos a actualizar, incluyendo los nuevos
    const datosActualizar = {
      titulo,
      descripcion,
      categoria,
      autor,
      anofabricacion,
      anollegada,
    };
    if (nombreArchivo) datosActualizar.archivo = nombreArchivo;

    const { data, error } = await supabase
      .from("modelos")
      .update(datosActualizar)
      .eq("id", id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
  },
);

// 4. ELIMINAR MODELO (Protegido)
app.delete("/api/modelos/:id", verificarToken, async (req, res) => {
  const id = req.params.id;

  const { data: modelo } = await supabase
    .from("modelos")
    .select("archivo")
    .eq("id", id)
    .single();

  if (modelo && modelo.archivo) {
    await supabase.storage.from("modelos").remove([modelo.archivo]);
  }

  const { error } = await supabase.from("modelos").delete().eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Eliminado correctamente de Supabase" });
});

app.listen(3000, () => {
  console.log(
    `Servidor de la UV corriendo con Supabase en http://localhost:3000`,
  );
});
