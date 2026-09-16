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
//
//           Examples never carry identifiers out of the file they were
//           captured from. Where a tool prints a patient name, patient id,
//           accession number or date, the value is replaced with an obviously
//           synthetic one and the sample says so. The point of a sample is the
//           shape of the output, which the real values contribute nothing to.
//           test-ui.js fails the build if an identifier-shaped value appears.

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
    example: { cmd: 'dcsrdump report.dcm', real: true,
      out: ': CONTAINER: (126000,DCM,"Imaging Measurement Report")  [SEPARATE] (DCMR,1500)\n\t>HAS CONCEPT MOD: CODE: (121049,DCM,"Language of Content Item and Descendants")  = (eng,RFC5646,"English")\n\t>HAS OBS CONTEXT: PNAME: (121008,DCM,"Person Observer Name")  = "unknown^unknown"' } },

  { id: 'dccidump', group: 'Inspect', summary: 'Print the content items of a structured object', arity: 'each', output: 'text',
    example: { cmd: 'dccidump report.dcm', real: true,
      out: 'CONTAINER: (126000,DCM,"Imaging Measurement Report")  [SEPARATE] (DCMR,1500)\nContent Sequence\n\tCODE: (121049,DCM,"Language of Content Item and Descendants")  = (eng,RFC5646,"English")' } },

  { id: 'dcdirdmp', group: 'Inspect', summary: 'List what a DICOMDIR indexes', arity: 'each', output: 'text',
    example: { cmd: 'dcdirdmp DICOMDIR', real: true,
      out: 'PATIENT Anon^Patient ANON0001\n\tSTUDY 20200101 ACC0000001 20200101 120000.000000\n\t\tSERIES 1 MR\n\t\t\tIMAGE 30\n\t\t\t -> c3.dcm\n\n(identifiers replaced; the layout is what the tool prints)' } },

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
    example: { cmd: 'dccmp a.dcm b.dcm', real: true,
      out: 'Identical pixel data prints nothing.\n\nWhen they differ:\n  a.dcm b.dcm differ: char 1, line 1' } },

  { id: 'dcdiff', group: 'Compare', summary: 'Diff the headers of two files',
    arity: 'pair', output: 'text', composed: true,
    example: { cmd: 'dcdiff a.dcm b.dcm', real: true,
      out: '1c1\n< (0x0002,0x0000) UL File Meta Information Group Length\n---\n> (0x0002,0x0000) UL File Meta Information Group Length' } },

  { id: 'dccp', group: 'Convert', summary: 'Copy a file, optionally changing its encoding', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.dcm$/i, '') + '.copy.dcm',
    example: { cmd: 'dccp -removeprivate in.dcm > out.dcm', real: true,
      out: 'Warning - Bad group length - Group 0x2 specified as 0xb8 actually 0xd6\n\n(128634 bytes in, 120344 out: 8 KB of private tags removed)' },
    options: [{ flag: '-removeprivate', label: 'Remove private tags' }] },

  { id: 'dcdecmpr', group: 'Convert', summary: 'Decompress ACR-NEMA compressed pixel data', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.dcm$/i, '') + '.decompressed.dcm',
    example: { cmd: 'dcdecmpr acrnema.dcm', real: true,
      out: 'BitsStored = <16>\nColumns = <5>\nRows = <2>\nCompressionRecognitionCode = <ACR-NEMA 1.0>\nCompressionCode = <DEF>' } },

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
    example: { cmd: 'dcuidchg -outdir out in.dcm', real: true,
      out: 'Warning - Bad group length - Group 0x2 specified as 0xb8 actually 0xd6\n\n(writes out/in.dcm, 128590 bytes, with remapped UIDs)' } },

  { id: 'dcmulti', group: 'Convert', summary: 'Build a multiframe image from single frames', arity: 'all', output: 'file',
    outputVia: 'stdout', outputName: () => 'multiframe.dcm',
    example: { cmd: 'dcmulti c1.dcm c2.dcm c3.dcm > multi.dcm', real: true,
      out: 'c1.dcm: Error - Missing attribute - Study ID\n\n(writes a 360132 byte object with NumberOfFrames = 3)' } },

  { id: 'dcdirmk', group: 'Convert', summary: 'Create a DICOMDIR for the selected files', arity: 'all', output: 'file',
    outputVia: 'stdout', outputName: () => 'DICOMDIR',
    example: { cmd: 'dcdirmk c1.dcm c2.dcm c3.dcm > DICOMDIR', real: true,
      out: 'c1.dcm: Warning - Missing attribute - Study ID - using default value <20200101>\n\n(writes a 14600 byte DICOMDIR indexing the three images; date replaced)' } },

  { id: 'dcsort', group: 'Convert', summary: 'Produce a sorted list of the selected images', arity: 'all', output: 'text',
    example: { cmd: 'dcsort *.dcm', real: false,
      out: 'Produced no output on any input tried, including a single series and a directory of images. Needs investigation.' } },

  { id: 'rawtodc', group: 'Convert', summary: 'Build a DICOM file from raw pixel data', arity: 'each', output: 'file',
    outputVia: 'stdout', outputName: (n) => n.replace(/\.raw$/i, '') + '.dcm',
    requiredArgs: ['-rows', '-columns', '-bits'],
    example: { cmd: 'rawtodc -rows 512 -columns 512 -bits 16 -little px.raw', real: true,
      out: '(writes a 119680 byte DICOM object wrapping the raw pixels)\n\nWithout -little or -big:\n  Error - Options incompatible - bits > 8 && !(little|big)' },
    freeformHint: '-rows 512 -columns 512 -bits 16 -little' },

  { id: 'dcsmpte', group: 'Convert', summary: 'Generate a SMPTE test pattern', arity: 'none', output: 'file',
    outputVia: 'stdout', outputName: () => 'smpte.dcm',
    example: { cmd: 'dcsmpte', real: true,
      out: 'Writes a 263 KB SMPTE pattern object (new UIDs on each run).' } },
];

const TOOLS_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const GROUPS = ['Validate', 'Inspect', 'Compare', 'Convert'];
