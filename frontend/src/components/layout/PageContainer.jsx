/*
 * Route-owned content width. The center column is already white and
 * full-bleed, so these caps only govern line length — they never leave
 * cream gutters inside the content region.
 *
 *   narrow — reading/social content (Home, Activity, Profile)
 *   wide   — grid/marketplace content (Discover)
 */
const WIDTH_CLASSES = {
  narrow: 'max-w-[680px]',
  wide: 'max-w-[1120px]',
};

function PageContainer({ width = 'narrow', className = '', ...props }) {
  return (
    <div
      className={`w-full ${WIDTH_CLASSES[width] ?? WIDTH_CLASSES.narrow} px-5 py-6 sm:px-7 lg:px-9 lg:py-9 ${className}`}
      {...props}
    />
  );
}

export default PageContainer;
