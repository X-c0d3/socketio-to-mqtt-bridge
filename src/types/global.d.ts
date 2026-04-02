declare module '*.png';

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}
