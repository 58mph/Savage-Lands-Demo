/**
 * Savage Arena PFP Generator
 * Composites layered NFT assets into profile pictures
 */

// Layer order (bottom to top) - matches HEAVY META template order
const LAYER_ORDER = [
    'Capes',       // 1. Behind everything
    'Shield',      // 2. Shield behind body
    'Base',        // 3. Creature body
    'Condition:Enhancement', // 4. Body effects
    'Pant',        // 5. Pants
    'Chest',       // 6. Chest armor
    'Boots',       // 7. Boots
    'Robes',       // 8. Robes
    'Gloves',      // 9. Gloves
    'ShieldStrap', // 10. Shield strap
    'Belt',        // 11. Belt
    'Off_Hand',    // 12. Off-hand items
    'Helms',       // 13. Helmet
    'Shoulder',    // 14. Shoulder armor
    'Sword'        // 15. Main weapon (front)
];

// Some assets live in alternate folders
const LAYER_PATHS = {
    'Base': ['layers/Base', 'layers/New Layers For Chipi/new bases'],
    'Sword': ['layers/Sword', 'layers/New Layers For Chipi/New Main Hand', 'layers/New Layers For Chipi'],
    'Boots': ['layers/Boots', 'layers/New Layers For Chipi/New Boots'],
    'Chest': ['layers/Chest', 'layers/New Layers For Chipi/New chest'],
    'Belt': ['layers/Belt', 'layers/New Layers For Chipi/New Belt'],
    'Gloves': ['layers/Gloves', 'layers/New Layers For Chipi/New Gloves'],
    'Shoulder': ['layers/Shoulder', 'layers/New Layers For Chipi/New Shoulder'],
    'Capes': ['layers/Capes', 'layers/New Layers For Chipi/New Cape', 'layers/New Layers For Chipi'],
    'Off_Hand': ['layers/Off_Hand', 'layers/Off_Hand/Items', 'layers/Off_Hand/Staff', 'layers/New Layers For Chipi/New Off Hand'],
    'ShieldStrap': ['layers/Shield/ShieldStrap'],
    'Shield': ['layers/Shield'],
    'Pant': ['layers/Pant'],
    'Robes': ['layers/Robes', 'layers/New Layers For Chipi'],
    'Helms': ['layers/Helms'],
    'Condition:Enhancement': ['layers/Condition:Enhancement']
};

// Map layer folder names to cleaner trait names
const LAYER_ALIASES = {
    'Base': 'creature',
    'Pant': 'pants',
    'Boots': 'boots',
    'Chest': 'chest',
    'Belt': 'belt',
    'Gloves': 'gloves',
    'Shoulder': 'shoulders',
    'Helms': 'helm',
    'Capes': 'cape',
    'Robes': 'robe',
    'Sword': 'weapon',
    'Shield': 'shield',
    'ShieldStrap': 'shieldStrap',
    'Off_Hand': 'offhand',
    'Condition:Enhancement': 'effect'
};

// Reverse lookup
const TRAIT_TO_LAYER = Object.fromEntries(
    Object.entries(LAYER_ALIASES).map(([k, v]) => [v, k])
);

// Available assets cache (populated on init)
let assetIndex = null;

/**
 * Initialize asset index by scanning layer folders
 */
async function initAssetIndex() {
    if (assetIndex) return assetIndex;
    
    try {
        const res = await fetch('layers/index.json');
        assetIndex = await res.json();
    } catch (e) {
        console.warn('layers/index.json not found, using fallback');
        // Fallback: hardcoded sample assets
        assetIndex = {
            Base: ['Lizardman', 'Bearkin', 'Minotaur', 'Salamander', 'Frogfolk', 'Black_Ratman', 'Crocodillian', 'Raccoon', 'Possum'],
            Sword: ['Longsword', 'Battle_Axe', 'Daggers', 'Crystal_Shard', 'Boar_Spear', 'Bone_Sword'],
            Boots: ['Adventurer\'s_Leather_Boots', 'Champion\'s_Boots', 'Demon_Hunter_Boots', 'Rogue\'s_Boots'],
            Chest: ['Plate_Mail', 'Chain_Mail', 'Leather_Armor', 'Mystic_Robes'],
            Helms: ['Iron_Helm', 'Viking_Helm', 'Crown', 'Hood'],
            Shield: ['Steel_Buckler', 'Viking_Shield', 'Wooden_Buckler'],
            Gloves: ['Leather_Gloves', 'Plate_Gauntlets', 'Cloth_Wraps'],
            Shoulder: ['Plate_Pauldrons', 'Leather_Pads', 'Fur_Mantle'],
            Pant: ['Leather_Pants', 'Cloth_Pants', 'Chain_Leggings'],
            Belt: ['Leather_Belt', 'Chain_Belt', 'Rope_Belt'],
            Capes: ['Red_Cape', 'Black_Cloak', 'Tattered_Cape'],
            'Condition:Enhancement': ['Fire_Aura', 'Ice_Glow', 'Shadow_Mist']
        };
    }
    return assetIndex;
}

/**
 * Build layer index from filesystem
 */
async function buildLayerIndex() {
    const index = {};
    const layerFolders = [
        'Base', 'Pant', 'Boots', 'Chest', 'Belt', 'Gloves', 
        'Shoulder', 'Helms', 'Capes', 'Robes', 'Sword', 
        'Shield', 'Off_Hand', 'Condition:Enhancement'
    ];
    
    for (const folder of layerFolders) {
        index[folder] = [];
        // This would need server-side directory listing
        // For now, we'll use the pre-built index.json
    }
    return index;
}

/**
 * Load an image and return a promise
 */
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
    });
}

/**
 * Try loading image from multiple paths, with filename variations
 */
async function loadImageFromPaths(filename, paths) {
    // Try different filename variations (underscores vs spaces)
    const variations = [
        filename,
        filename.replace(/_/g, ' '),  // Try with spaces
        filename.replace(/ /g, '_'),  // Try with underscores
    ];
    
    for (const basePath of paths) {
        for (const fname of variations) {
            try {
                const img = await loadImage(`${basePath}/${fname}`);
                return img;
            } catch (e) {
                // Try next variation/path
            }
        }
    }
    return null;
}

/**
 * Generate PFP from trait set
 * @param {Object} traits - { creature: 'Lizardman', weapon: 'Longsword', boots: 'Rogue\'s_Boots', ... }
 * @param {Object} options - { size: 64, format: 'png' }
 * @returns {Promise<string>} - Data URL of composed image
 */
async function generatePFP(traits, options = {}) {
    const size = options.size || 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Enable crisp pixel art scaling
    ctx.imageSmoothingEnabled = false;
    
    // Layer in order
    for (const layerFolder of LAYER_ORDER) {
        const traitName = LAYER_ALIASES[layerFolder] || layerFolder.toLowerCase();
        const traitValue = traits[traitName];
        
        if (!traitValue) continue;
        
        // Build filename - handle spaces and underscores
        const filename = traitValue.replace(/ /g, '_') + '.png';
        
        // Get search paths for this layer
        const searchPaths = LAYER_PATHS[layerFolder] || [`layers/${layerFolder}`];
        
        const img = await loadImageFromPaths(filename, searchPaths);
        if (img) {
            ctx.drawImage(img, 0, 0, size, size);
        } else {
            console.warn(`Layer not found: ${traitValue} in ${layerFolder}`);
        }
    }
    
    return canvas.toDataURL('image/png');
}

/**
 * Generate PFP for a fighter based on role/traits
 * Maps fighter data to appropriate layer assets
 */
async function generateFighterPFP(fighter, options = {}) {
    // Map role to base creature (matching actual asset names)
    const ROLE_CREATURES = {
        'Tank': 'Bearkin',
        'Berserker': 'Minotaur', 
        'Mage': 'Salamander',
        'Rogue': 'Black_Ratman',
        'Cleric': 'Albino_Crocodillian',
        'Necromancer': 'White_Ratman',
        'Bard': 'Frogfolk'
    };
    
    // Role-based gear using ACTUAL asset names from index.json
    const ROLE_GEAR = {
        'Tank': { 
            weapon: 'Steel_Longsword', 
            chest: 'Tanking_Plate', 
            boots: 'Champion\'s_Boots',
            pants: 'Full_Plate_Greaves',
            gloves: 'Tanking_Fists',
            shoulders: 'Tanking_Plate',
            belt: 'Tanking_Plate',
            shield: 'Steel_Buckler',
            shieldStrap: 'Steel_Buckler_Strap'
        },
        'Berserker': { 
            weapon: 'Berserker_Axe', 
            chest: 'Fury_Chestpiece', 
            boots: 'Destroyer\'s_Boots',
            pants: 'Fury_Leggings',
            gloves: 'Fury_Gloves',
            shoulders: 'Fury_Shoulders',
            belt: 'Fury_Belt',
            effect: 'Berzerker'
        },
        'Mage': { 
            weapon: 'Crystal_Shard', 
            robe: 'Summoner\'s_Robe', 
            boots: 'Mana_Imbued_Boots',
            gloves: 'Mana_Imbued_Gloves',
            shoulders: 'Mana_Charged',
            offhand: 'Flamewielder\'s_Staff'
        },
        'Rogue': { 
            weapon: 'Bone_Dagger', 
            chest: 'Rogue\'s_Leather_Chest', 
            boots: 'Rogue\'s_Boots', 
            cape: 'Nightstalker\'s_Hood',
            pants: 'Thief\'s_Cloth',
            gloves: 'Rogue\'s_Gloves',
            shoulders: 'Rogue\'s_Shoulderpads',
            belt: 'Rogue_Stalker\'s_Wrap'
        },
        'Cleric': { 
            weapon: 'Holy_Smiter', 
            robe: 'Holy_Healer\'s_Annointed_Cloth', 
            boots: 'Healer\'s_Walkers',
            gloves: 'Healer\'s_Touch',
            shoulders: 'Healer\'s_Mantle',
            belt: 'Healer\'s_Sash',
            effect: 'Holy_Mark'
        },
        'Necromancer': { 
            weapon: 'Bone_Sword', 
            robe: 'Apostle_of_Doom', 
            boots: 'Underworld',
            gloves: 'Necromancer\'s_Touch',
            belt: 'Necromancer\'s_Cinch',
            offhand: 'Necromancer\'s_Staff',
            effect: 'Ebon_Skin'
        },
        'Bard': { 
            weapon: 'Rapier', 
            chest: 'Jester\'s_Costume', 
            boots: 'Jester\'s_Silk_Boots', 
            cape: 'Royal_Silk_cape',
            pants: 'Grey_Leiderhosen',
            gloves: 'Jester\'s_Silk_Gloves',
            shoulders: 'Jester\'s_Coif',
            belt: 'Jester\'s_Belt'
        }
    };
    
    const creature = fighter.creature || ROLE_CREATURES[fighter.role] || 'Lizardman';
    const roleGear = ROLE_GEAR[fighter.role] || ROLE_GEAR['Tank'];
    
    // Build traits from fighter data, falling back to role defaults
    const traits = {
        creature: creature,
        weapon: fighter.weapon || roleGear.weapon,
        boots: fighter.boots || roleGear.boots,
        chest: fighter.chest || roleGear.chest,
        helm: fighter.helm || roleGear.helm,
        gloves: fighter.gloves || roleGear.gloves,
        shoulders: fighter.shoulders || roleGear.shoulders,
        pants: fighter.pants || roleGear.pants,
        belt: fighter.belt || roleGear.belt,
        cape: fighter.cape || roleGear.cape,
        robe: fighter.robe || roleGear.robe,
        shield: fighter.shield || roleGear.shield,
        shieldStrap: fighter.shieldStrap || roleGear.shieldStrap,
        offhand: fighter.offhand || roleGear.offhand,
        effect: fighter.effect || roleGear.effect
    };
    
    return generatePFP(traits, options);
}

/**
 * Create PFP element for display
 */
async function createPFPElement(fighter, size = 48) {
    const dataUrl = await generateFighterPFP(fighter, { size });
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = `width:${size}px;height:${size}px;image-rendering:pixelated;border-radius:4px;`;
    img.className = 'fighter-pfp';
    img.alt = fighter.name;
    return img;
}

/**
 * Batch generate PFPs for roster
 */
async function generateRosterPFPs(fighters, size = 48) {
    const results = {};
    for (const fighter of fighters) {
        try {
            results[fighter.id] = await generateFighterPFP(fighter, { size });
        } catch (e) {
            console.warn(`Failed to generate PFP for ${fighter.name}:`, e);
            results[fighter.id] = null;
        }
    }
    return results;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generatePFP, generateFighterPFP, createPFPElement, generateRosterPFPs, initAssetIndex };
}

// Global export for browser
window.PFPGenerator = { generatePFP, generateFighterPFP, createPFPElement, generateRosterPFPs, initAssetIndex };
