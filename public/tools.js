// Catalog of the dicom3tools programs exposed by this page.
//
// arity   - how selected files map onto runs:
//           'each' one run per file, 'all' one run over every file,
//           'pair' exactly two files, 'none' takes no input file
// output  - 'text' writes its findings to the console output only,
//           'file' also produces a file to download
// outputVia - where a file-producing tool puts its output. Verified by running
//           each tool against the native binaries; they are not consistent:
//           'stdout'     writes the file to standard output (the most common)
//           'positional' takes the output filename as a second positional arg
//           'outdir'     writes into a directory named by -outdir
// composed - implemented in JS by chaining other tools, mirroring the
//            upstream shell script of the same name
// example - shown beside the tool while choosing. `real: true` means the
//           output was captured from the actual binary; `real: false` means
//           there is no captured sample yet and the text describes the result
//           rather than pretending to be output.

const OPTION_INPUT = [
  { flag: '-input-nometa', label: 'No meta header' },
  { flag: '-ignoreoutofordertags', label: 'Ignore out-of-order tags' },
  { flag: '-usvrlutdata', label: 'US VR for LUT data' },
];

const TOOLS = [
  {
    id: 'dciodvfy',
    group: 'Validate',
    summary: 'Check a file against its IOD rules',
    arity: 'each',
    output: 'text',
    example: {
      cmd: 'dciodvfy CT_small.dcm',
      real: true,
      out: "CTImage\nWarning - Value is zero for value 1 of attribute <Patient's Weight>\nWarning - is only permitted to be empty when actually unknown ... - attribute <Laterality>",
    },
    options: [
      { flag: '-new', label: 'New-style messages', default: true },
      { flag: '-describe', label: 'Describe IOD' },
      { flag: '-dump', label: 'Dump dataset' },
      { flag: '-filename', label: 'Show filename' },
      { flag: '-allpffgitems', label: 'All per-frame items' },
      { flag: '-verbose', label: 'Verbose' },
    ],
    profiles: ['', 'Dental', 'IHEMammo', 'IHEMammoDBT', 'XDSI', 'REM', 'VOIP', 'OpticalPath', 'QTUS'],
  },
  {
    id: 'dcentvfy',
    group: 'Validate',
    summary: 'Check patient, study and series agree across files',
    arity: 'all',
    output: 'text',
    example: {
      cmd: 'dcentvfy a.dcm b.dcm',
      real: true,
      out: '(prints nothing when the files are consistent)',
    },
    options: [{ flag: '-verbose', label: 'Verbose' }],
  },

  { id: 'dcdump', group: 'Inspect', summary: 'List every attribute with its tag, VR and value', arity: 'each', output: 'text',
    example: { cmd: 'dcdump CT_small.dcm', real: true,
      out: '(0x0002,0x0002) UI Media Storage SOP Class UID\n\tVR=<UI>  VL=<0x001a>  <1.2.840.10008.5.1.4.1.1.2>' },
    options: [{ flag: '-describe', label: 'Describe' }, { flag: '-verbose', label: 'Verbose' }] },

  { id: 'dcfile', group: 'Inspect', summary: 'Show the transfer syntax and file meta information', arity: 'each', output: 'text',
    example: { cmd: 'dcfile CT_small.dcm', real: true,
      out: 'Meta: UID\t\t1.2.840.10008.1.2.1\nMeta: Description\t"Explicit VR Little Endian"\nMeta: ByteOrder\tLittle' } },

  { id: 'dcinfo', group: 'Inspect', summary: 'Summarize what kind of instance this is', arity: 'each', output: 'text',
    example: { cmd: 'dcinfo CT_small.dcm', real: true,
      out: 'Transfer Syntax to read data set is unencapsulated\nIs a non-enhanced family instance\nIs not an instance of a Concatenation\nIs an image with a single frame\nIs an image with unencapsulated PixelData' } },

  { id: 'dcsrdump', group: 'Inspect', summary: 'Print structured report content as a tree', arity: 'each', output: 'text',
    example: { cmd: 'dcsrdump report.dcm', real: false,
      out: 'Prints the structured report content tree, one content item per line, indented by nesting level.' } },

  { id: 'dccidump', group: 'Inspect', summary: 'Print the content items of a structured object', arity: 'each', output: 'text',
    example: { cmd: 'dccidump report.dcm', real: false,
      out: 'Prints each content item with its concept name and value.' } },

  { id: 'dcdirdmp', group: 'Inspect', summary: 'List what a DICOMDIR indexes', arity: 'each', output: 'text',
    example: { cmd: 'dcdirdmp DICOMDIR', real: false,
      out: 'Lists the patient, study, series and image records the DICOMDIR points at.' } },

  { id: 'dckey', group: 'Inspect', summary: 'Print just the attribute values you name', arity: 'each', output: 'text',
    example: { cmd: 'dckey -k Modality -k PatientID CT_small.dcm', real: true, out: 'CT\n1CT1' },
    freeformHint: '-k PatientID -k StudyDate' },

  { id: 'dcdict', group: 'Inspect', summary: 'Look a keyword up in the data dictionary', arity: 'none', output: 'text',
    example: { cmd: 'dcdict -k PatientID', real: true, out: '(0x0010,0x0020) LO Patient ID' },
    freeformHint: '-k PatientID' },

  { id: 'dcstats', group: 'Inspect', summary: 'Minimum, maximum and mean pixel values', arity: 'each', output: 'text',
    example: { cmd: 'dcstats CT_small.dcm', real: true,
      out: 'Signed minimum value = 0x80\t(128 dec)\nSigned maximum value = 0x88f\t(2191 dec)\nUnsigned minimum value = 0x80\t(128 dec)' } },

  { id: 'dchist', group: 'Inspect', summary: 'Pixel value histogram and entropy', arity: 'each', output: 'text',
    example: { cmd: 'dchist CT_small.dcm', real: true,
      out: '9.40291\tZero order entropy (bits per pixel)\n0x80\tSmallest symbol value\n8\tSmallest symbol length (bits)' } },

  { id: 'dccmp', group: 'Compare', summary: 'Compare pixel data of two files byte for byte',
    arity: 'pair', output: 'text', composed: true,
    example: { cmd: 'dccmp a.dcm b.dcm', real: false,
      out: 'Reports the first differing byte, or nothing when the pixel data matches.' } },

  { id: 'dcdiff', group: 'Compare', summary: 'Diff the headers of two files',
    arity: 'pair', output: 'text', composed: true,
    example: { cmd: 'dcdiff a.dcm b.dcm', real: true,
      out: '1c1\n< (0x0002,0x0000) UL File Meta Information Group Length\n---\n> (0x0002,0x0000) UL File Meta Information Group Length' } },

  { id: 'dccp', group: 'Convert', summary: 'Copy a file, optionally changing its encoding', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.dcm$/i, '') + '.copy.dcm',
    example: { cmd: 'dccp -removeprivate in.dcm', real: false,
      out: 'Writes the copied file, with private tags removed.' },
    options: [{ flag: '-removeprivate', label: 'Remove private tags' }] },

  { id: 'dcdecmpr', group: 'Convert', summary: 'Decompress encapsulated pixel data', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.dcm$/i, '') + '.decompressed.dcm',
    example: { cmd: 'dcdecmpr compressed.dcm', real: false,
      out: 'Writes the same object with its pixel data decompressed.' } },

  { id: 'dctoraw', group: 'Convert', summary: 'Write the pixel data out as a raw file', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.dcm$/i, '') + '.raw',
    example: { cmd: 'dctoraw CT_small.dcm', real: true,
      out: 'Writes 32768 bytes of raw pixel data for this 128x128 16-bit image.' } },

  { id: 'dctopnm', group: 'Convert', summary: 'Convert the image to a PNM file', arity: 'each', output: 'file',
    outputVia: 'positional', outputName: (n) => n.replace(/\.dcm$/i, '') + '.pnm',
    example: { cmd: 'dctopnm CT_small.dcm out.pnm', real: true,
      out: '\tRows = 128\n\tColumns = 128\n\tNumberOfFrames = 1' } },

  { id: 'dcuidchg', group: 'Convert', summary: 'Rewrite UIDs consistently across a set of files', arity: 'all', output: 'file',
    outputVia: 'outdir',
    example: { cmd: 'dcuidchg -outdir out *.dcm', real: false,
      out: 'Writes each file to the output directory with new, consistently remapped UIDs.' } },

  { id: 'dcmulti', group: 'Convert', summary: 'Build a multiframe image from single frames', arity: 'all', output: 'file',
    outputVia: 'stdout', outputName: () => 'multiframe.dcm',
    example: { cmd: 'dcmulti frame1.dcm frame2.dcm', real: false,
      out: 'Writes one multiframe object built from the inputs.' } },

  { id: 'dcdirmk', group: 'Convert', summary: 'Create a DICOMDIR for the selected files', arity: 'all', output: 'file',
    outputVia: 'stdout', outputName: () => 'DICOMDIR',
    example: { cmd: 'dcdirmk *.dcm', real: false,
      out: 'Writes a DICOMDIR indexing the given files.' } },

  { id: 'dcsort', group: 'Convert', summary: 'Produce a sorted list of the selected images', arity: 'all', output: 'text',
    example: { cmd: 'dcsort *.dcm', real: false, out: 'Prints the filenames in sorted order.' } },

  { id: 'rawtodc', group: 'Convert', summary: 'Build a DICOM file from raw pixel data', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.raw$/i, '') + '.dcm',
    requiredArgs: ['-rows', '-columns', '-bits'],
    example: { cmd: 'rawtodc -rows 512 -columns 512 -bits 16 in.raw', real: false,
      out: 'Writes a DICOM object wrapping the raw pixel data.' },
    freeformHint: '-rows 512 -columns 512 -bits 16' },

  { id: 'dcsmpte', group: 'Convert', summary: 'Generate a SMPTE test pattern', arity: 'none', output: 'file',
    outputVia: 'stdout', outputName: () => 'smpte.dcm',
    example: { cmd: 'dcsmpte', real: true,
      out: 'Writes a 263 KB SMPTE pattern object (new UIDs on each run).' } },
];

const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const GROUPS = ['Validate', 'Inspect', 'Compare', 'Convert'];
