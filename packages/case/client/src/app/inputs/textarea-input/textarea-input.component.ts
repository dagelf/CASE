import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  OnInit
} from '@angular/core'
import { PropertyDescription } from '~shared/interfaces/property-description.interface'

@Component({
  selector: 'app-textarea-input',
  standalone: true,
  template: `<label [for]="prop.propName">{{ prop.label }}</label>
    <textarea
      class="textarea"
      (change)="onChange($event)"
      #input
      [name]="prop.propName"
    >
    </textarea> `,
  styleUrls: ['./textarea-input.component.scss']
})
export class TextareaInputComponent implements OnInit {
  @Input() prop: PropertyDescription
  @Input() value: string

  @Output() valueChanged: EventEmitter<number> = new EventEmitter()

  @ViewChild('input', { static: true }) input: ElementRef

  ngOnInit(): void {
    if (this.value !== undefined) {
      this.input.nativeElement.value = this.value
    }
  }

  onChange(event: any) {
    this.valueChanged.emit(event.target.value)
  }
}
