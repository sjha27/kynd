// White content surface on the cream canvas — the tonal separation does the
// work, so elevation stays minimal. Padding is opt-out for media-led cards
// that need their image to bleed to the card edge.
function Card({ as: As = 'div', interactive = false, padded = true, className = '', ...props }) {
  return (
    <As
      className={`overflow-hidden rounded-card border border-line bg-surface ${
        padded ? 'p-4' : ''
      } ${interactive ? 'transition-colors hover:border-line-strong' : ''} ${className}`}
      {...props}
    />
  );
}

export default Card;
