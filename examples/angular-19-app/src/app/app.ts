import { Component } from '@angular/core';
import { HeaderComponent } from './header/header.component';
import { CardComponent } from './card/card.component';
import { PopoverComponent } from './popover/popover.component';

@Component({
  selector: 'app-root',
  imports: [HeaderComponent, CardComponent, PopoverComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
