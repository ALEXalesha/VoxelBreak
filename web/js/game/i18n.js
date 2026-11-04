// Строки игры на двух языках. Каждый ключ есть в обоих (это проверяет закон).
export const LANGS = ['ru', 'en'];

export const STRINGS = {
  ru: {
    title: 'VoxelBreak',
    subtitle: 'Песочница разрушения: всё ломается по кусочкам',
    fan: 'Фан-игра. Графика и звуки сделаны кодом.',
    play: 'Новый мир', continue: 'Продолжить', settings: 'Настройки', about: 'Об игре', quit: 'Выход', back: 'Назад',
    newWorld: 'Новый мир', worldKind: 'Тип мира', kind_town: 'Город', kind_nature: 'Природа', kind_mixed: 'Смешанный',
    worldSize: 'Размер', size_small: 'Малый', size_normal: 'Обычный', size_large: 'Большой',
    seed: 'Зерно', seedHint: 'пусто - случайное', create: 'Создать',
    paused: 'Пауза', resume: 'Продолжить', save: 'Сохранить', load: 'Загрузить', toMenu: 'В меню',
    saved: 'Мир сохранён', noSave: 'Сохранения нет', saveFailed: 'Не удалось сохранить', loadFailed: 'Не удалось загрузить',
    building: 'Строится мир…', clickToPlay: 'Щёлкните, чтобы играть',
    tab_general: 'Общие', tab_keys: 'Клавиши', tab_graphics: 'Графика',
    language: 'Язык', theme: 'Тема меню', theme_glass: 'Стеклянная', theme_formal: 'Строгая', theme_light: 'Светлая', theme_night: 'Ночная', theme_warm: 'Тёплая',
    sens: 'Чувствительность мыши', invertY: 'Инвертировать мышь по вертикали', fov: 'Поле зрения', volume: 'Громкость',
    shadows: 'Тени', distance: 'Дальность', dist_low: 'Близко', dist_mid: 'Средне', dist_high: 'Далеко', on: 'Вкл', off: 'Выкл',
    resetKeys: 'Сбросить клавиши', pressKey: 'Нажмите клавишу…', done: 'Готово',
    act_forward: 'Вперёд', act_back: 'Назад', act_left: 'Влево', act_right: 'Вправо', act_jump: 'Прыжок / вверх', act_crouch: 'Присесть / вниз',
    act_run: 'Бег', act_use: 'Сесть в технику / выйти', act_fly: 'Полёт', act_camera: 'Вид от третьего лица', act_fire1: 'Действие', act_fire2: 'Второе действие',
    act_tool1: 'Молот', act_tool2: 'Руки', act_tool3: 'Динамит', act_tool4: 'Дробовик', act_tool5: 'Ракетница', act_tool6: 'Лазер', act_tool7: 'Техника',
    tool_hammer: 'Молот', tool_hands: 'Руки', tool_dynamite: 'Динамит', tool_shotgun: 'Дробовик', tool_rocket: 'Ракетница', tool_laser: 'Лазер', tool_vehicle: 'Техника',
    hint_hammer: 'ЛКМ - удар', hint_hands: 'ЛКМ - толкнуть или бросить, ПКМ - взять', hint_dynamite: 'ЛКМ - поставить (взрыв через 3 с)',
    hint_shotgun: 'ЛКМ - выстрел', hint_rocket: 'ЛКМ - пуск', hint_laser: 'ЛКМ (держать) - резать', hint_vehicle: 'ЛКМ - поставить, ПКМ - сменить, E - сесть',
    veh_car: 'Машина', veh_bulldozer: 'Бульдозер', veh_crane: 'Кран с шаром',
    driving: 'W/S - газ, A/D - руль, E - выйти', craneHelp: 'A/D - стрела, W/S - трос, E - выйти',
    stat_destroyed: 'Выбито', stat_bodies: 'Обломков', stat_awake: 'в движении', fps: 'к/с', flying: 'Полёт',
    empty: 'Кончились заряды',
    aboutText: 'VoxelBreak - фан-игра, песочница разрушения в воксельном мире. Оторванный кусок становится отдельным телом и падает, конструкция без опоры рушится. Графика и звуки сделаны кодом, чужих марок нет.',
    authorship: 'Код, тесты и документацию написал Claude (Anthropic) в Claude Code; идеи, проверка и решения - Алексея.',
    controls: 'Управление: WASD - ходить, мышь - смотреть, 1-7 - инструменты, колесо - сменить, F - полёт, E - техника, Esc - пауза.',
  },
  en: {
    title: 'VoxelBreak',
    subtitle: 'A destruction sandbox: everything breaks into pieces',
    fan: 'A fan game. Graphics and sounds are made in code.',
    play: 'New world', continue: 'Continue', settings: 'Settings', about: 'About', quit: 'Quit', back: 'Back',
    newWorld: 'New world', worldKind: 'World type', kind_town: 'Town', kind_nature: 'Nature', kind_mixed: 'Mixed',
    worldSize: 'Size', size_small: 'Small', size_normal: 'Normal', size_large: 'Large',
    seed: 'Seed', seedHint: 'empty - random', create: 'Create',
    paused: 'Paused', resume: 'Resume', save: 'Save', load: 'Load', toMenu: 'Main menu',
    saved: 'World saved', noSave: 'No save yet', saveFailed: 'Could not save', loadFailed: 'Could not load',
    building: 'Building the world…', clickToPlay: 'Click to play',
    tab_general: 'General', tab_keys: 'Keys', tab_graphics: 'Graphics',
    language: 'Language', theme: 'Menu theme', theme_glass: 'Glass', theme_formal: 'Formal', theme_light: 'Light', theme_night: 'Night', theme_warm: 'Warm',
    sens: 'Mouse sensitivity', invertY: 'Invert mouse vertically', fov: 'Field of view', volume: 'Volume',
    shadows: 'Shadows', distance: 'Draw distance', dist_low: 'Near', dist_mid: 'Medium', dist_high: 'Far', on: 'On', off: 'Off',
    resetKeys: 'Reset keys', pressKey: 'Press a key…', done: 'Done',
    act_forward: 'Forward', act_back: 'Back', act_left: 'Left', act_right: 'Right', act_jump: 'Jump / up', act_crouch: 'Crouch / down',
    act_run: 'Run', act_use: 'Enter / leave vehicle', act_fly: 'Fly', act_camera: 'Third-person view', act_fire1: 'Action', act_fire2: 'Second action',
    act_tool1: 'Sledgehammer', act_tool2: 'Hands', act_tool3: 'Dynamite', act_tool4: 'Shotgun', act_tool5: 'Rocket launcher', act_tool6: 'Laser', act_tool7: 'Vehicles',
    tool_hammer: 'Sledgehammer', tool_hands: 'Hands', tool_dynamite: 'Dynamite', tool_shotgun: 'Shotgun', tool_rocket: 'Rocket launcher', tool_laser: 'Laser', tool_vehicle: 'Vehicles',
    hint_hammer: 'LMB - strike', hint_hands: 'LMB - push or throw, RMB - grab', hint_dynamite: 'LMB - place (blows in 3 s)',
    hint_shotgun: 'LMB - shoot', hint_rocket: 'LMB - launch', hint_laser: 'LMB (hold) - cut', hint_vehicle: 'LMB - place, RMB - switch, E - enter',
    veh_car: 'Car', veh_bulldozer: 'Bulldozer', veh_crane: 'Wrecking-ball crane',
    driving: 'W/S - throttle, A/D - steer, E - leave', craneHelp: 'A/D - boom, W/S - cable, E - leave',
    stat_destroyed: 'Destroyed', stat_bodies: 'Debris', stat_awake: 'moving', fps: 'fps', flying: 'Flying',
    empty: 'Out of ammo',
    aboutText: 'VoxelBreak is a fan game, a destruction sandbox in a voxel world. A piece that comes off becomes its own body and falls; a structure without support collapses. Graphics and sounds are made in code, no third-party brands.',
    authorship: 'Code, tests and docs are written by Claude (Anthropic) in Claude Code; ideas, testing and decisions - Alexey.',
    controls: 'Controls: WASD - walk, mouse - look, 1-7 - tools, wheel - switch, F - fly, E - vehicles, Esc - pause.',
  },
};

export function pickLang(navLang) {
  return String(navLang || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function translator(lang) {
  const d = STRINGS[lang] || STRINGS.en;
  return (key) => (Object.hasOwn(d, key) ? d[key] : key);
}
