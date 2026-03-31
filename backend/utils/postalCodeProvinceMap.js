/**
 * Canadian Postal Code First-Letter → Province Map
 *
 * Covers all Forward Sortation Area (FSA) prefixes assigned by Canada Post.
 * Note: X covers both Northwest Territories and Nunavut — flagged as 'NT_NU'.
 */
module.exports = {
  'A': 'NL', 'B': 'NS', 'C': 'PE', 'E': 'NB',
  'G': 'QC', 'H': 'QC', 'J': 'QC',
  'K': 'ON', 'L': 'ON', 'M': 'ON', 'N': 'ON', 'P': 'ON',
  'R': 'MB', 'S': 'SK', 'T': 'AB',
  'V': 'BC', 'X': 'NT_NU', 'Y': 'YT'
};
