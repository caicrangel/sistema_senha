// Presença de médicos logados na plataforma (em memória, via Socket.IO).
// Um médico "online" é aquele com a tela de Consultório aberta e conectada.

// socketId -> { doctorId, doctorName, specialtyId }
const doctors = new Map();

export function setDoctor(socketId, info) {
  doctors.set(socketId, info);
}

export function removeSocket(socketId) {
  return doctors.delete(socketId);
}

// Resumo da presença: total, médicos únicos e disponibilidade por especialidade.
// Um médico sem especialidade (specialtyId null) atende todas — conta para qualquer uma.
export function summary() {
  const uniques = new Map(); // doctorId -> specialtyId
  for (const { doctorId, specialtyId } of doctors.values()) {
    uniques.set(doctorId, specialtyId);
  }
  const generalists = [...uniques.values()].filter((s) => s == null).length;
  const bySpecialty = {};
  for (const specialtyId of uniques.values()) {
    if (specialtyId != null) bySpecialty[specialtyId] = (bySpecialty[specialtyId] || 0) + 1;
  }
  // Generalistas somam em todas as especialidades
  const availability = { generalists };
  for (const [spec, n] of Object.entries(bySpecialty)) {
    availability[spec] = n + generalists;
  }
  return {
    total: uniques.size,
    generalists,
    availability,
    onlineIds: [...uniques.keys()], // ids dos médicos online (para status por profissional)
  };
}

// Há médico apto a atender a especialidade? (específico dela ou generalista)
export function isSpecialtyOnline(specialtyId) {
  const s = summary();
  if (s.generalists > 0) return true;
  return (s.availability[specialtyId] || 0) > 0;
}
