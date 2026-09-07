const CLIENT_ADJECTIVES = ['Bright', 'Calm', 'Clever', 'Cool', 'Fresh', 'Gentle', 'Happy', 'Jolly', 'Kind', 'Lucky', 'Quick', 'Sunny'];
const CLIENT_FRUITS = ['Apple', 'Berry', 'Cherry', 'Grape', 'Kiwi', 'Lemon', 'Mango', 'Melon', 'Orange', 'Peach', 'Pear', 'Plum'];

export const generatedClientNames = new Set(CLIENT_ADJECTIVES.flatMap((adjective) => CLIENT_FRUITS.map((fruit) => `${adjective} ${fruit}`)));

export const generateClientName = () => {
  const adjective = CLIENT_ADJECTIVES[Math.floor(Math.random() * CLIENT_ADJECTIVES.length)];
  const fruit = CLIENT_FRUITS[Math.floor(Math.random() * CLIENT_FRUITS.length)];
  return `${adjective} ${fruit}`;
};
