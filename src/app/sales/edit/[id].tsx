import { useLocalSearchParams } from 'expo-router';
import { InvoiceEditorScreen } from '@/screens/invoice-editor-screen';

export default function EditInvoiceRoute(){
  const params=useLocalSearchParams<{id:string;kind?:string}>();
  return <InvoiceEditorScreen kind={params.kind==='purchase'?'purchase':'sale'} documentId={String(params.id)}/>;
}
