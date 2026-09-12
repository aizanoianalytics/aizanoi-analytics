// js/data/shop-catalog.js
// Antik Macellum Tüccarı Kataloğu

export const SHOP_CATALOG = {
  weapons: ['doric_spear', 'legion_gladius', 'temple_hammer', 'phrygian_bow', 'penkalas_bow', 'zeus_staff', 'zeus_splinter'],
  armors: ['leather_lorica', 'bronze_squamata', 'marble_plating', 'oracle_robe', 'sacred_aegis'],
  accessories: ['olive_branch_charm', 'scarab_amulet', 'obsidian_eye_ring', 'penkalas_tear', 'zeus_spark_amulet', 'laurel_wreath'],
  xpPackages: [
    { id: 'apprentice_spark', name: 'Apprentice Spark', price: 100, xp: 60, desc: 'Gain 60 Zeus Sparks.' },
    { id: 'oracle_spark', name: 'Oracle Spark', price: 250, xp: 180, desc: 'Gain 180 Zeus Sparks.' },
    { id: 'titan_spark', name: 'Titan Resonance', price: 500, xp: 450, desc: 'Gain 450 Zeus Sparks.' },
  ],
};
