import { createRoot } from 'react-dom/client'
import './widget.css'
import WidgetApp from './WidgetApp'

createRoot(document.getElementById('widget')!).render(<WidgetApp />)
