// ============================================================
// ARDE Campo · Configuración
// Lo único que hay que cambiar al publicar es API_URL:
// la URL de la implementación web del proyecto Apps Script "ARDE Campo API".
// ============================================================
window.ARDE_CONFIG = {
  API_URL: 'PEGAR_AQUI_LA_URL_DE_LA_API/exec',
  VERSION: '1.0.0',

  DISTRITOS: [
    'Miraflores, Lima', 'Surco, Lima', 'San Isidro, Lima', 'La Victoria, Lima', 'Cercado de Lima, Lima',
    'Jesús María, Lima', 'Surquillo, Lima', 'San Miguel, Lima', 'Chorrillos, Lima', 'San Borja, Lima',
    'La Molina, Lima', 'Independencia, Lima', 'Puente Piedra, Lima', 'Los Olivos, Lima', 'Lince, Lima',
    'Magdalena, Lima', 'Pueblo Libre, Lima', 'Breña, Lima', 'Barranco, Lima', 'Rimac, Lima', 'S.J.L., Lima',
    'S.J.M., Lima', 'Ate, Lima', 'Santa Anita, Lima', 'Comas, Lima', 'VES, Lima', 'Callao, Lima',
    'Chosica, Lima', 'Chiclayo, Lambayeque', 'Piura, Piura', 'Trujillo, La Libertad', 'Tacna, Tacna',
    'Huancayo, Junín', 'Huarmey, Ancash', 'Otro',
  ],
  INDUSTRIAS: [
    'Inmobiliaria', 'Retail', 'Estética', 'Alimentos y bebidas', 'Hospedaje', 'Odontología',
    'Transporte', 'Oficinas', 'Salud', 'Veterinaria', 'Minimarket', 'Otro',
  ],
  // Respaldo si el servidor no devuelve el catálogo de REF_Equipos
  MODELOS_RESPALDO: [
    { codigo: 'D50MINI', tanque: 45 }, { codigo: 'GAM-2001HF', tanque: 1000 }, { codigo: 'GAL-8001H', tanque: 2000 },
    { codigo: 'M63', tanque: 1000 }, { codigo: 'Q1000PRO', tanque: 1000 }, { codigo: 'A500', tanque: 500 },
    { codigo: 'HZ-1202', tanque: 120 }, { codigo: 'A300', tanque: 200, legacy: true }, { codigo: 'A320', tanque: 400, legacy: true },
    { codigo: 'S1500PLUS', tanque: 500, legacy: true }, { codigo: 'U5', tanque: 500, legacy: true },
  ],
};
